package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/h2non/filetype"
	"github.com/subosito/gozaru"
	"gopkg.in/yaml.v3"
)

// VersionInfo represents the version information
type VersionInfo struct {
	Version string `json:"version"`
}

// getVersion returns the current backend version
func getVersion(w http.ResponseWriter, r *http.Request) {
	versionInfo := VersionInfo{
		Version: Version,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(versionInfo)
}

func addNewPost(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("X-API-Key")
	if key != settingConfig.ApiSecretKey {
		http.Error(w, "error", http.StatusBadRequest)
		return
	}

	var message Message
	var err error
	defer r.Body.Close()

	body := Message{}
	if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("Failed to decode message: %v\n", err)
		http.Error(w, "error", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if settingConfig.MessageSignature != "" {
		body.Text = body.Text + "\n\n---\n" + settingConfig.MessageSignature
	}

	message.ID = getMessageNextId(ctx)
	message.Type = "md" //body.Type
	message.Author = body.Author
	// Use provided timestamp or current time if not provided
	if body.Timestamp.IsZero() {
		message.Timestamp = time.Now()
	} else {
		message.Timestamp = body.Timestamp
	}
	message.Text = body.Text
	message.Views = 0
	message.ReplyTo = body.ReplyTo
	message.IsThread = body.IsThread

	if err = setMessage(ctx, message, false); err != nil {
		log.Printf("Failed to set new message: %v\n", err)
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(message)
}

func addNewPostWithFiles(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("X-API-Key")
	if key != settingConfig.ApiSecretKey {
		http.Error(w, "Invalid API key", http.StatusUnauthorized)
		return
	}

	if !settingConfig.AllowApiFileUpload {
		http.Error(w, "File upload via API is not enabled", http.StatusForbidden)
		return
	}

	defer r.Body.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Parse multipart form
	maxSize := int64(settingConfig.ApiMaxFileSizePerFile * settingConfig.ApiMaxFilesPerMessage << 20)
	r.Body = http.MaxBytesReader(w, r.Body, maxSize)

	if err := r.ParseMultipartForm(maxSize); err != nil {
		log.Printf("Failed to parse multipart form: %v\n", err)
		http.Error(w, "error parsing form", http.StatusBadRequest)
		return
	}

	// Parse message JSON from form field
	messageData := r.FormValue("message")
	if messageData == "" {
		http.Error(w, "message field is required", http.StatusBadRequest)
		return
	}

	var body Message
	if err := json.Unmarshal([]byte(messageData), &body); err != nil {
		log.Printf("Failed to decode message: %v\n", err)
		http.Error(w, "error decoding message", http.StatusBadRequest)
		return
	}

	// Handle file uploads
	var files []FileResponse
	form := r.MultipartForm
	if form != nil && form.File != nil {
		uploadedFiles := form.File["files"]
		if len(uploadedFiles) > int(settingConfig.ApiMaxFilesPerMessage) {
			http.Error(w, "too many files", http.StatusBadRequest)
			return
		}

		if len(uploadedFiles) == 0 {
			http.Error(w, "no files uploaded", http.StatusBadRequest)
			return
		}

		for _, fileHeader := range uploadedFiles {
			// Check file size
			if fileHeader.Size > int64(settingConfig.ApiMaxFileSizePerFile<<20) {
				http.Error(w, "file too large", http.StatusRequestEntityTooLarge)
				return
			}

			file, err := fileHeader.Open()
			if err != nil {
				log.Printf("Failed to open uploaded file: %v\n", err)
				http.Error(w, "error processing file", http.StatusInternalServerError)
				return
			}
			defer file.Close()

			// Process and save file
			fileResp, err := processAndSaveFile(file, fileHeader)
			if err != nil {
				log.Printf("Failed to save file: %v\n", err)
				http.Error(w, "error saving file", http.StatusInternalServerError)
				return
			}

			files = append(files, fileResp)
		}
	} else {
		http.Error(w, "no files provided", http.StatusBadRequest)
		return
	}

	// Add signature if configured
	if settingConfig.MessageSignature != "" {
		body.Text = body.Text + "\n\n---\n" + settingConfig.MessageSignature
	}

	// Create message
	var message Message
	message.ID = getMessageNextId(ctx)
	message.Type = "md"
	message.Author = body.Author
	// Use provided timestamp or current time if not provided
	if body.Timestamp.IsZero() {
		message.Timestamp = time.Now()
	} else {
		message.Timestamp = body.Timestamp
	}
	message.Text = body.Text
	message.Views = 0
	message.ReplyTo = body.ReplyTo
	message.IsThread = body.IsThread

	// Embed files in message text (like regular file uploads)
	if len(files) > 0 {
		for _, file := range files {
			var embedded string
			if file.FileType == "image" {
				embedded = "[image-embedded#](" + file.URL + ")"
			} else if file.FileType == "video" {
				embedded = "[video-embedded#](" + file.URL + ")"
			} else if file.FileType == "audio" {
				embedded = "[audio-embedded#](" + file.URL + ")"
			} else {
				embedded = "[" + file.Filename + "](" + file.URL + ")"
			}

			if message.Text != "" {
				message.Text += "\n"
			}
			message.Text += embedded
		}
	}

	if err := setMessage(ctx, message, false); err != nil {
		log.Printf("Failed to set new message: %v\n", err)
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(message)
}

func processAndSaveFile(file multipart.File, fileHeader *multipart.FileHeader) (FileResponse, error) {
	// Create upload directory if not exists
	if err := os.MkdirAll(rootUploadPath, os.ModePerm); err != nil {
		return FileResponse{}, err
	}

	// Read file header to detect type
	head := make([]byte, 512)
	file.Read(head)
	t, _ := filetype.Match(head)

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	// Generate file hash
	fileHash, err := generatedFileHash(file)
	if err != nil {
		return FileResponse{}, err
	}

	// Create hash subdirectory
	hashSubDir := filepath.Join(rootUploadPath, fileHash[:2], fileHash[2:4])
	if err := os.MkdirAll(hashSubDir, os.ModePerm); err != nil {
		return FileResponse{}, err
	}

	// Check if file already exists (deduplication)
	destPath := filepath.Join(hashSubDir, fileHash)
	_, err = os.Stat(destPath)
	isDuplicateFile := err == nil

	// Save file if not duplicate
	if !isDuplicateFile {
		file.Seek(0, io.SeekStart)
		destFile, err := os.Create(destPath)
		if err != nil {
			return FileResponse{}, err
		}
		defer destFile.Close()

		if _, err := io.Copy(destFile, file); err != nil {
			return FileResponse{}, err
		}
	}

	// Generate unique ID for this file reference
	id := generatedRandomID(20)
	if id == "" {
		return FileResponse{}, err
	}

	// Create YAML metadata directory
	yamlFileDir := filepath.Join(rootUploadPath, id[:2], id[2:4])
	if err := os.MkdirAll(yamlFileDir, os.ModePerm); err != nil {
		return FileResponse{}, err
	}

	// Sanitize filename
	safeFilename := gozaru.Sanitize(fileHeader.Filename)

	// Create metadata
	fileMetadata := map[string]any{
		"id":       id,
		"filename": safeFilename,
		"hash":     fileHash,
		"type":     t.MIME.Type,
		"delete":   false,
	}

	// Save metadata as YAML
	metadataFilePath := filepath.Join(rootUploadPath, id[:2], id[2:4], id+".yaml")
	metadataFile, err := os.Create(metadataFilePath)
	if err != nil {
		return FileResponse{}, err
	}
	defer metadataFile.Close()

	yamlData, err := yaml.Marshal(fileMetadata)
	if err != nil {
		return FileResponse{}, err
	}
	metadataFile.Write(yamlData)

	// Return file response
	return FileResponse{
		URL:      "/api/files/" + id,
		Filename: safeFilename,
		FileType: t.MIME.Type,
	}, nil
}
