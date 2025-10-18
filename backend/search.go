package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

type SearchRequest struct {
	Query         string `json:"query"`
	Mode          string `json:"mode"` // "simple" OR "advanced"
	Limit         int    `json:"limit"`
	Offset        int    `json:"offset"`
}

type SearchResponse struct {
	Results []Message `json:"results"`
	Total   int       `json:"total"`
	Query   string    `json:"query"`
	HasMore bool      `json:"hasMore"`
	TookMs  int64     `json:"tookMs"`
}

const (
	maxSearchesPerSecond = 2
	maxSearchesPerMinute = 30
	maxSearchesPerHour   = 500
)

func normalizeText(text string) string {
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	normalized, _, _ := transform.String(t, text)
	
	normalized = strings.ToLower(normalized)
	
	replacer := strings.NewReplacer(
		`"`, "",
		`'`, "",
		`'`, "",
		`"`, "",
		`"`, "",
		`״`, "",
		`׳`, "",
		"-", " ",
		"_", " ",
		"–", " ",
		"—", " ",
	)
	normalized = replacer.Replace(normalized)
	
	normalized = strings.Join(strings.Fields(normalized), " ")
	
	return strings.TrimSpace(normalized)
}

func checkSearchRateLimit(ctx context.Context, userId string) error {
	now := time.Now()
	
	keySecond := fmt.Sprintf("search:limit:%s:second:%d", userId, now.Unix())
	keyMinute := fmt.Sprintf("search:limit:%s:minute:%d", userId, now.Unix()/60)
	keyHour := fmt.Sprintf("search:limit:%s:hour:%d", userId, now.Unix()/3600)
	
	countSecond, err := rdb.Incr(ctx, keySecond).Result()
	if err != nil {
		return err
	}
	if countSecond == 1 {
		rdb.Expire(ctx, keySecond, 2*time.Second)
	}
	if countSecond > maxSearchesPerSecond {
		return fmt.Errorf("חרגת ממגבלת החיפושים בשנייה. נסה שוב בעוד שנייה")
	}
	
	countMinute, err := rdb.Incr(ctx, keyMinute).Result()
	if err != nil {
		return err
	}
	if countMinute == 1 {
		rdb.Expire(ctx, keyMinute, 2*time.Minute)
	}
	if countMinute > maxSearchesPerMinute {
		return fmt.Errorf("חרגת ממגבלת החיפושים בדקה. נסה שוב בעוד דקה")
	}
	
	countHour, err := rdb.Incr(ctx, keyHour).Result()
	if err != nil {
		return err
	}
	if countHour == 1 {
		rdb.Expire(ctx, keyHour, 2*time.Hour)
	}
	if countHour > maxSearchesPerHour {
		return fmt.Errorf("חרגת ממגבלת החיפושים בשעה. נסה שוב בעוד שעה")
	}
	
	return nil
}

func searchMessagesSimple(ctx context.Context, query string, limit, offset int, isAdmin, isAuthenticated, isModerator bool) ([]Message, int, error) {
	normalizedQuery := normalizeText(query)
	if normalizedQuery == "" {
		return []Message{}, 0, fmt.Errorf("שאילתת חיפוש ריקה")
	}
	
	queryWords := strings.Fields(normalizedQuery)
	if len(queryWords) == 0 {
		return []Message{}, 0, fmt.Errorf("שאילתת חיפוש ריקה")
	}
	
	allMessageKeys, err := rdb.Keys(ctx, "messages:*").Result()
	if err != nil {
		return []Message{}, 0, err
	}
	
	var matchedMessages []Message
	
	for _, messageKey := range allMessageKeys {
		if !regexp.MustCompile(`^messages:\d+$`).MatchString(messageKey) {
			continue
		}
		
		messageData, err := rdb.HGetAll(ctx, messageKey).Result()
		if err != nil || len(messageData) == 0 {
			continue
		}
		
		isDeleted := messageData["deleted"] == "1"
		if isDeleted && !isAdmin && !isModerator {
			continue
		}
		
		isThread := messageData["is_thread"] == "1"
		replyTo := messageData["reply_to"]
		if isThread && replyTo != "" && replyTo != "0" {
			continue
		}
		
		messageText := normalizeText(messageData["text"])
		messageAuthor := normalizeText(messageData["author"])
		
		allWordsFound := true
		for _, word := range queryWords {
			if !strings.Contains(messageText, word) && !strings.Contains(messageAuthor, word) {
				allWordsFound = false
				break
			}
		}
		
		if !allWordsFound {
			continue
		}
		
		message, err := parseMessageFromRedis(messageData, isAdmin, isAuthenticated, isModerator)
		if err != nil {
			continue
		}
		
		matchedMessages = append(matchedMessages, message)
	}
	
	total := len(matchedMessages)
	
	sortMessagesByDate(matchedMessages, true)
	
	start := offset
	if start > total {
		return []Message{}, total, nil
	}
	
	end := start + limit
	if end > total {
		end = total
	}
	
	return matchedMessages[start:end], total, nil
}

func searchMessagesAdvanced(ctx context.Context, pattern string, limit, offset int, isAdmin, isAuthenticated, isModerator bool) ([]Message, int, error) {
	regex, err := regexp.Compile(pattern)
	if err != nil {
		return []Message{}, 0, fmt.Errorf("ביטוי רגולרי לא תקין: %v", err)
	}
	
	if len(pattern) > 500 {
		return []Message{}, 0, fmt.Errorf("ביטוי רגולרי ארוך מדי (מקסימום 500 תווים)")
	}
	
	allMessageKeys, err := rdb.Keys(ctx, "messages:*").Result()
	if err != nil {
		return []Message{}, 0, err
	}
	
	var matchedMessages []Message
	
	for _, messageKey := range allMessageKeys {
		if !regexp.MustCompile(`^messages:\d+$`).MatchString(messageKey) {
			continue
		}
		
		messageData, err := rdb.HGetAll(ctx, messageKey).Result()
		if err != nil || len(messageData) == 0 {
			continue
		}
		
		isDeleted := messageData["deleted"] == "1"
		if isDeleted && !isAdmin && !isModerator {
			continue
		}
		
		isThread := messageData["is_thread"] == "1"
		replyTo := messageData["reply_to"]
		if isThread && replyTo != "" && replyTo != "0" {
			continue
		}
		
		messageText := messageData["text"]
		messageAuthor := messageData["author"]
		
		if !regex.MatchString(messageText) && !regex.MatchString(messageAuthor) {
			continue
		}
		
		message, err := parseMessageFromRedis(messageData, isAdmin, isAuthenticated, isModerator)
		if err != nil {
			continue
		}
		
		matchedMessages = append(matchedMessages, message)
	}
	
	total := len(matchedMessages)
	
	sortMessagesByDate(matchedMessages, true)
	
	start := offset
	if start > total {
		return []Message{}, total, nil
	}
	
	end := start + limit
	if end > total {
		end = total
	}
	
	return matchedMessages[start:end], total, nil
}

func parseMessageFromRedis(data map[string]string, isAdmin, isAuthenticated, isModerator bool) (Message, error) {
	var message Message
	
	if idStr, ok := data["id"]; ok {
		id, err := strconv.Atoi(idStr)
		if err != nil {
			return message, err
		}
		message.ID = id
	}
	
	message.Type = data["type"]
	
	message.Text = data["text"]
	
	if isAdmin || isModerator {
		message.Author = data["author"]
		message.AuthorId = data["authorId"]
	} else if settingConfig.ShowAuthorToAuthenticated && isAuthenticated {
		message.Author = data["author"]
		message.AuthorId = data["authorId"]
	} else {
		message.Author = "Anonymous"
		message.AuthorId = "Anonymous"
	}
	
	if ts, ok := data["timestamp"]; ok {
		timestamp, _ := time.Parse(time.RFC3339, ts)
		message.Timestamp = timestamp
	}
	
	if !settingConfig.HideEditTime {
		if le, ok := data["last_edit"]; ok && le != "" {
			lastEdit, _ := time.Parse(time.RFC3339, le)
			message.LastEdit = lastEdit
		}
	}
	
	message.Deleted = data["deleted"] == "1"
	
	if settingConfig.CountViews && (!settingConfig.HideCountViewsForUsers || isAdmin || isModerator) {
		if viewsStr, ok := data["views"]; ok {
			views, _ := strconv.Atoi(viewsStr)
			message.Views = views
		}
	}
	
	if reactionsStr, ok := data["reactions"]; ok && reactionsStr != "" {
		var reactions Reactions
		json.Unmarshal([]byte(reactionsStr), &reactions)
		message.Reactions = reactions
	}
	
	if replyToStr, ok := data["reply_to"]; ok && replyToStr != "" && replyToStr != "0" {
		replyTo, _ := strconv.Atoi(replyToStr)
		message.ReplyTo = replyTo
	}
	
	message.IsThread = data["is_thread"] == "1"
	
	return message, nil
}

func sortMessagesByDate(messages []Message, descending bool) {
	for i := 0; i < len(messages)-1; i++ {
		for j := 0; j < len(messages)-i-1; j++ {
			var shouldSwap bool
			if descending {
				shouldSwap = messages[j].Timestamp.Before(messages[j+1].Timestamp)
			} else {
				shouldSwap = messages[j].Timestamp.After(messages[j+1].Timestamp)
			}
			
			if shouldSwap {
				messages[j], messages[j+1] = messages[j+1], messages[j]
			}
		}
	}
}

func searchMessages(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	session, err := store.Get(r, cookieName)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	
	userSession, ok := session.Values["user"].(Session)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	
	if err := checkSearchRateLimit(ctx, userSession.ID); err != nil {
		http.Error(w, err.Error(), http.StatusTooManyRequests)
		return
	}
	
	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()
	
	if req.Query == "" {
		http.Error(w, "Query cannot be empty", http.StatusBadRequest)
		return
	}
	
	if len(req.Query) > 1000 {
		http.Error(w, "Query too long (max 1000 characters)", http.StatusBadRequest)
		return
	}
	
	if req.Mode != "simple" && req.Mode != "advanced" {
		req.Mode = "simple"
	}
	
	if req.Limit <= 0 || req.Limit > 100 {
		req.Limit = 20
	}
	
	if req.Offset < 0 {
		req.Offset = 0
	}
	
	isAdmin := userSession.Privileges[Admin]
	isAuthenticated := true
	isModerator := userSession.Privileges[Moderator]
	
	var results []Message
	var total int
	
	switch req.Mode {
	case "simple":
		results, total, err = searchMessagesSimple(ctx, req.Query, req.Limit, req.Offset, isAdmin, isAuthenticated, isModerator)
	case "advanced":
		results, total, err = searchMessagesAdvanced(ctx, req.Query, req.Limit, req.Offset, isAdmin, isAuthenticated, isModerator)
	}
	
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	response := SearchResponse{
		Results: results,
		Total:   total,
		Query:   req.Query,
		HasMore: req.Offset+len(results) < total,
		TookMs:  time.Since(startTime).Milliseconds(),
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}