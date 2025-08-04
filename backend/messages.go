package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi"
)

func getMessages(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	offsetFromClient := r.URL.Query().Get("offset")
	limitFromClient := r.URL.Query().Get("limit")
	direction := r.URL.Query().Get("direction")

	offset, err := strconv.Atoi(offsetFromClient)
	if err != nil {
		offset = 0
	}

	limit, err := strconv.Atoi(limitFromClient)
	if err != nil {
		limit = 20
	}

	isAuthenticated := false
	isAdmin := false
	isModerator := false
	
	session, err := store.Get(r, cookieName)
	if err == nil {
		if userSession, ok := session.Values["user"].(Session); ok {
			isAuthenticated = true
			isAdmin = userSession.Privileges[Admin]
			isModerator = userSession.Privileges[Moderator]
		}
	}

	messages, err := funcGetMessageRange(ctx, int64(offset), int64(limit), isAdmin, settingConfig.CountViews, isAuthenticated, isModerator, direction)
	if err != nil {
		log.Printf("Failed to get messages: %v\n", err)
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)

	addViewsToMessages(ctx, messages)
}

func getThreadRepliesHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	messageIdParam := chi.URLParam(r, "messageId")
	messageId, err := strconv.Atoi(messageIdParam)
	if err != nil {
		http.Error(w, "Invalid message ID", http.StatusBadRequest)
		return
	}

	isAuthenticated := false
	session, err := store.Get(r, cookieName)
	if err == nil {
		if _, ok := session.Values["user"].(Session); ok {
			isAuthenticated = true
		}
	}

	replies, err := funcGetThreadReplies(ctx, messageId, checkPrivilege(r, Writer), settingConfig.CountViews, isAuthenticated)
	if err != nil {
		log.Printf("Failed to get thread replies: %v\n", err)
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(replies)
}

func addMessage(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var message Message
	var err error
	defer r.Body.Close()

	session, _ := store.Get(r, cookieName)
	user, _ := session.Values["user"].(Session)

	body := Message{}
	if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("Failed to decode message: %v\n", err)
		http.Error(w, "error", http.StatusBadRequest)
		return
	}

	for _, regex := range settingConfig.RegexReplace {
		t := regex.Pattern.ReplaceAllString(body.Text, regex.Replace)
		body.Text = t
	}

	if body.ReplyTo > 0 {
    	replyToKey := fmt.Sprintf("messages:%d", body.ReplyTo)
    	exists, err := rdb.Exists(ctx, replyToKey).Result()
    	if err != nil || exists == 0 {
    	    log.Printf("Referenced message %d does not exist", body.ReplyTo)
        	http.Error(w, "Referenced message not found", http.StatusBadRequest)
        	return
    	}
	}

	message.ID = getMessageNextId(ctx)
	message.Type = body.Type
	message.Author = user.PublicName
	message.AuthorId = user.ID
	message.Timestamp = time.Now()
	message.Text = body.Text
	message.File = body.File
	message.Views = 0
	message.ReplyTo = body.ReplyTo
	message.IsThread = body.IsThread

	if err = setMessage(ctx, message, false); err != nil {
		log.Printf("Failed to set new message: %v\n", err)
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	go SendWebhook(context.Background(), "create", message)
	go pushFcmMessage(message)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(message)
}

func updateMessage(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var err error
	defer r.Body.Close()

	session, _ := store.Get(r, cookieName)
	user, ok := session.Values["user"].(Session)
	if !ok {
		http.Error(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	body := Message{}
	if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
		response := Response{Success: false}
		json.NewEncoder(w).Encode(response)
		return
	}

	messageKey := fmt.Sprintf("messages:%d", body.ID)
	exists, err := rdb.Exists(ctx, messageKey).Result()
	if err != nil || exists == 0 {
		http.Error(w, "Message not found", http.StatusNotFound)
		return
	}

	originalMessage, err := rdb.HGetAll(ctx, messageKey).Result()
	if err != nil {
		http.Error(w, "Failed to get original message", http.StatusInternalServerError)
		return
	}

	originalAuthorId := originalMessage["authorId"]
	isAdmin := user.Privileges[Admin]
	isModerator := user.Privileges[Moderator]
	isOwner := originalAuthorId == user.ID

	if !isAdmin && !isModerator {
		if !isOwner {
			http.Error(w, "You can only edit your own messages", http.StatusForbidden)
			return
		}

		if !user.Privileges[Writer] {
			http.Error(w, "Writer privilege required to edit messages", http.StatusForbidden)
			return
		}

		timestampStr := originalMessage["timestamp"]
		if timestampStr == "" {
			http.Error(w, "Message timestamp not found", http.StatusInternalServerError)
			return
		}

		timestamp, err := time.Parse(time.RFC3339, timestampStr)
		if err != nil {
			http.Error(w, "Invalid message timestamp", http.StatusInternalServerError)
			return
		}

		elapsedTime := time.Since(timestamp).Seconds()
		if elapsedTime > float64(settingConfig.EditTimeLimit) {
			http.Error(w, "Edit time limit exceeded", http.StatusForbidden)
			return
		}
	}

	body.LastEdit = time.Now()

	if err := setMessage(ctx, body, true); err != nil {
		response := Response{Success: false}
		json.NewEncoder(w).Encode(response)
		return
	}

	go SendWebhook(context.Background(), "update", body)

	response := Response{Success: true}
	json.NewEncoder(w).Encode(response)
}

func deleteMessage(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	idInt, err := strconv.Atoi(id)
	if err != nil {
		http.Error(w, "Invalid message ID", http.StatusBadRequest)
		return
	}

	session, _ := store.Get(r, cookieName)
	user, ok := session.Values["user"].(Session)
	if !ok {
		http.Error(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	messageKey := fmt.Sprintf("messages:%s", id)
	exists, err := rdb.Exists(ctx, messageKey).Result()
	if err != nil || exists == 0 {
		http.Error(w, "Message not found", http.StatusNotFound)
		return
	}

	originalMessage, err := rdb.HGetAll(ctx, messageKey).Result()
	if err != nil {
		http.Error(w, "Failed to get original message", http.StatusInternalServerError)
		return
	}

	originalAuthorId := originalMessage["authorId"]
	isAdmin := user.Privileges[Admin]
	isModerator := user.Privileges[Moderator]
	isOwner := originalAuthorId == user.ID

	if !isAdmin && !isModerator {
		if !isOwner {
			http.Error(w, "You can only delete your own messages", http.StatusForbidden)
			return
		}

		if !user.Privileges[Writer] {
			http.Error(w, "Writer privilege required to delete messages", http.StatusForbidden)
			return
		}

		timestampStr := originalMessage["timestamp"]
		if timestampStr == "" {
			http.Error(w, "Message timestamp not found", http.StatusInternalServerError)
			return
		}

		timestamp, err := time.Parse(time.RFC3339, timestampStr)
		if err != nil {
			http.Error(w, "Invalid message timestamp", http.StatusInternalServerError)
			return
		}

		elapsedTime := time.Since(timestamp).Seconds()
		if elapsedTime > float64(settingConfig.EditTimeLimit) {
			http.Error(w, "Delete time limit exceeded", http.StatusForbidden)
			return
		}
	}

	message := Message{ID: idInt, Deleted: true}

	if err := funcDeleteMessage(ctx, id); err != nil {
		response := Response{Success: false}
		json.NewEncoder(w).Encode(response)
		return
	}

	go SendWebhook(context.Background(), "delete", message)

	response := Response{Success: true}
	json.NewEncoder(w).Encode(response)
}

func getEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	clientCtx := r.Context()
	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	_, err := fmt.Fprintf(w, "data: {\"type\": \"heartbeat\"}\n\n")
	if err != nil {
		return
	}
	flusher.Flush()

	pubsub := rdb.Subscribe(r.Context(), "events")
	defer pubsub.Close()

	if _, err := pubsub.Receive(clientCtx); err != nil {
		http.Error(w, "Failed to subscribe to events", http.StatusInternalServerError)
		return
	}

	for {
		select {
		case <-clientCtx.Done():
			return

		case <-heartbeat.C:
			_, err := fmt.Fprintf(w, "data: {\"type\": \"heartbeat\"}\n\n")
			if err != nil {
				return
			}
			flusher.Flush()

		case msg, ok := <-pubsub.Channel():
			if !ok {
				return
			}
			_, err := fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
