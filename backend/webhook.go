package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// var webhookURL string = os.Getenv("WEBHOOK_URL")
// var verifyToken string = os.Getenv("WEBHOOK_VERIFY_TOKEN")

type WebhookPayload struct {
	Action      string    `json:"action"`
	Message     Message   `json:"message"`
	Timestamp   time.Time `json:"timestamp"`
	VerifyToken string    `json:"verifyToken"`
}

func SendWebhook(ctx context.Context, action string, message Message) {
	if settingConfig.WebhookURL != "" {
		sendStandardWebhook(ctx, action, message)
	}

	// Send Google Chat webhook only for create action
	if settingConfig.GoogleChatWebhookEnabled && settingConfig.GoogleChatWebhookURL != "" && action == "create" {
		sendGoogleChatWebhook(ctx, message)
	}
}

func sendStandardWebhook(ctx context.Context, action string, message Message) {
	payload := WebhookPayload{
		Action:      action,
		Message:     message,
		Timestamp:   time.Now(),
		VerifyToken: settingConfig.VerifyToken,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error converting webhook data to JSON: %v\n", err)
		return
	}

	httpCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(httpCtx, "POST", settingConfig.WebhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error creating webhook request: %v\n", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "TheChannel-Webhook")

	// Warning! Default is not secure
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("❌ Error sending webhook to %s: %v\n", settingConfig.WebhookURL, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("✓ Webhook sent successfully for action '%s' on message %d. Response code: %d\n",
			action, message.ID, resp.StatusCode)
	} else {
		// Read response body for error details
		bodyBytes := make([]byte, 1024)
		n, _ := resp.Body.Read(bodyBytes)
		bodyText := string(bodyBytes[:n])

		log.Printf("❌ Webhook FAILED for action '%s' on message %d\n"+
			"   URL: %s\n"+
			"   Status Code: %d %s\n"+
			"   Response Body: %s\n"+
			"   Payload: %s\n",
			action, message.ID,
			settingConfig.WebhookURL,
			resp.StatusCode, http.StatusText(resp.StatusCode),
			bodyText,
			string(jsonData))
	}
}

type GoogleChatMessage struct {
	Text   string            `json:"text"`
	Thread *GoogleChatThread `json:"thread,omitempty"`
}

type GoogleChatThread struct {
	ThreadKey string `json:"threadKey,omitempty"`
}

func sendGoogleChatWebhook(ctx context.Context, message Message) {
	text := formatGoogleChatMessage(message)

	payload := GoogleChatMessage{
		Text: text,
	}

	// Handle threading for replies
	if message.ReplyTo > 0 {
		// Use the parent message ID as the thread key
		// threadKey is a custom identifier that creates a new thread if it doesn't exist
		// or uses an existing one if it does
		threadKey := fmt.Sprintf("thread_%d", message.ReplyTo)
		payload.Thread = &GoogleChatThread{
			ThreadKey: threadKey,
		}
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error converting Google Chat webhook data to JSON: %v\n", err)
		return
	}

	httpCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Build the URL with messageReplyOption if we have a thread
	webhookURL := settingConfig.GoogleChatWebhookURL
	if message.ReplyTo > 0 {
		webhookURL += "&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"
	}

	req, err := http.NewRequestWithContext(httpCtx, "POST", webhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error creating Google Chat webhook request: %v\n", err)
		return
	}

	req.Header.Set("Content-Type", "application/json; charset=UTF-8")

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("❌ Error sending Google Chat webhook to %s: %v\n", settingConfig.GoogleChatWebhookURL, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("✓ Google Chat webhook sent successfully for message %d. Response code: %d\n",
			message.ID, resp.StatusCode)
	} else {
		// Read response body for error details
		bodyBytes := make([]byte, 1024)
		n, _ := resp.Body.Read(bodyBytes)
		bodyText := string(bodyBytes[:n])

		log.Printf("❌ Google Chat webhook FAILED for message %d\n"+
			"   URL: %s\n"+
			"   Status Code: %d %s\n"+
			"   Response Body: %s\n"+
			"   Payload: %s\n",
			message.ID,
			settingConfig.GoogleChatWebhookURL,
			resp.StatusCode, http.StatusText(resp.StatusCode),
			bodyText,
			string(jsonData))
	}
}

func formatGoogleChatMessage(message Message) string {
	baseURL := settingConfig.GoogleChatWebhookBaseURL
	if baseURL == "" {
		baseURL = "http://localhost"
	}
	baseURL = strings.TrimSuffix(baseURL, "/")

	// Process the message text to convert embedded markdown links to full URLs
	processedText := convertMarkdownLinksToURLs(message.Text, baseURL)

	var text string
	// Add author and message text
	if message.Author != "" {
		text = fmt.Sprintf("*%s*: %s", message.Author, processedText)
	} else {
		text = processedText
	}

	// Add file link if present (in addition to any embedded in text)
	if message.File.URL != "" {
		fileURL := baseURL + message.File.URL
		text += fmt.Sprintf("\n\n📎 קובץ מצורף: %s", fileURL)
	}

	return text
}

// convertMarkdownLinksToURLs converts markdown-style links to full URLs
func convertMarkdownLinksToURLs(text string, baseURL string) string {
	result := text

	// Replace all markdown links with full URLs
	for {
		startIdx := strings.Index(result, "[")
		if startIdx == -1 {
			break
		}

		endBracketIdx := strings.Index(result[startIdx:], "]")
		if endBracketIdx == -1 {
			break
		}
		endBracketIdx += startIdx

		if endBracketIdx+1 >= len(result) || result[endBracketIdx+1] != '(' {
			// Not a markdown link, skip this bracket
			result = result[:startIdx] + strings.Replace(result[startIdx:], "[", "｟", 1)
			continue
		}

		endParenIdx := strings.Index(result[endBracketIdx:], ")")
		if endParenIdx == -1 {
			break
		}
		endParenIdx += endBracketIdx

		// Extract the link text and path
		linkText := result[startIdx+1 : endBracketIdx]
		linkPath := result[endBracketIdx+2 : endParenIdx]

		// Check if this is an embedded file link (contains # or is image/file marker)
		isEmbedded := strings.Contains(linkText, "#") ||
			strings.Contains(linkText, "image-embedded") ||
			strings.Contains(linkText, "audio-embedded") ||
			strings.Contains(linkText, "video-embedded") ||
			strings.Contains(linkText, "file-embedded")

		var replacement string
		if isEmbedded {
			// For embedded files, just show the full URL
			fullURL := baseURL + linkPath
			replacement = fullURL
		} else if linkText != "" {
			// For regular links with text, show "text: URL"
			fullURL := baseURL + linkPath
			replacement = fmt.Sprintf("%s: %s", linkText, fullURL)
		} else {
			// No link text, just show URL
			fullURL := baseURL + linkPath
			replacement = fullURL
		}

		// Replace the markdown link with the URL
		result = result[:startIdx] + replacement + result[endParenIdx+1:]
	}

	// Restore any escaped brackets
	result = strings.ReplaceAll(result, "｟", "[")

	return result
}
