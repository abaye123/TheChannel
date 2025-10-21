package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/redis/go-redis/v9"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

type SearchRequest struct {
	Query    string `json:"query"`
	Mode     string `json:"mode"`
	Limit    int    `json:"limit"`
	Offset   int    `json:"offset"`
	DaysBack int    `json:"daysBack"`
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
	workerPoolSize       = 10
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

func processMessagesParallel(ctx context.Context, keys []string, queryWords []string, isAdmin, isAuthenticated, isModerator bool) []Message {
	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		matched []Message
	)

	keysChan := make(chan string, len(keys))
	for _, key := range keys {
		keysChan <- key
	}
	close(keysChan)

	for i := 0; i < workerPoolSize; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for key := range keysChan {
				select {
				case <-ctx.Done():
					return
				default:
				}

				if !regexp.MustCompile(`^messages:\d+$`).MatchString(key) {
					continue
				}

				messageData, err := rdb.HGetAll(ctx, key).Result()
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

				mu.Lock()
				matched = append(matched, message)
				mu.Unlock()
			}
		}()
	}

	wg.Wait()
	return matched
}

func searchMessagesSimple(ctx context.Context, query string, limit, offset int, isAdmin, isAuthenticated, isModerator bool, daysBack int) ([]Message, int, error) {
	normalizedQuery := normalizeText(query)
	if normalizedQuery == "" {
		return []Message{}, 0, fmt.Errorf("שאילתת חיפוש ריקה")
	}

	queryWords := strings.Fields(normalizedQuery)
	if len(queryWords) == 0 {
		return []Message{}, 0, fmt.Errorf("שאילתת חיפוש ריקה")
	}

	minTimestamp := time.Now().AddDate(0, 0, -daysBack).Unix()

	messageKeys, err := rdb.ZRevRangeByScore(ctx, "m_times:1", &redis.ZRangeBy{
		Min: fmt.Sprintf("%d", minTimestamp),
		Max: "+inf",
	}).Result()
	if err != nil {
		return []Message{}, 0, fmt.Errorf("שגיאה בשליפת הודעות: %v", err)
	}

	matchedMessages := processMessagesParallel(ctx, messageKeys, queryWords, isAdmin, isAuthenticated, isModerator)

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

func searchMessagesAdvanced(ctx context.Context, pattern string, limit, offset int, isAdmin, isAuthenticated, isModerator bool, daysBack int) ([]Message, int, error) {
	if len(pattern) > 500 {
		return []Message{}, 0, fmt.Errorf("ביטוי רגולרי ארוך מדי (מקסימום 500 תווים)")
	}

	if err := validateRegexPattern(pattern); err != nil {
		return []Message{}, 0, fmt.Errorf("ביטוי רגולרי לא בטוח: %v", err)
	}

	regex, err := compileRegexWithTimeout(pattern, 2*time.Second)
	if err != nil {
		return []Message{}, 0, fmt.Errorf("ביטוי רגולרי לא תקין: %v", err)
	}

	minTimestamp := time.Now().AddDate(0, 0, -daysBack).Unix()

	messageKeys, err := rdb.ZRevRangeByScore(ctx, "m_times:1", &redis.ZRangeBy{
		Min: fmt.Sprintf("%d", minTimestamp),
		Max: "+inf",
	}).Result()
	if err != nil {
		return []Message{}, 0, fmt.Errorf("שגיאה בשליפת הודעות: %v", err)
	}

	var (
		matchedMessages []Message
		mu              sync.Mutex
		wg              sync.WaitGroup
	)

	keysChan := make(chan string, len(messageKeys))
	for _, key := range messageKeys {
		keysChan <- key
	}
	close(keysChan)

	for i := 0; i < workerPoolSize; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for key := range keysChan {
				select {
				case <-ctx.Done():
					return
				default:
				}

				if !regexp.MustCompile(`^messages:\d+$`).MatchString(key) {
					continue
				}

				messageData, err := rdb.HGetAll(ctx, key).Result()
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

				matched, err := matchWithTimeout(regex, messageText, messageAuthor, 100*time.Millisecond)
				if err != nil {
					continue
				}

				if !matched {
					continue
				}

				message, err := parseMessageFromRedis(messageData, isAdmin, isAuthenticated, isModerator)
				if err != nil {
					continue
				}

				mu.Lock()
				matchedMessages = append(matchedMessages, message)
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

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

func validateRegexPattern(pattern string) error {
	dangerousPatterns := []string{
		`(\w+)+`, // Nested quantifiers
		`(\d+)+`,
		`(.*)+`,
		`(.+)+`,
		`(\w*)*`,
		`(\d*)*`,
		`(.*)*`,
		`(.+)*`,
		`(\w+)*`,
		`(a+)+`,
		`(a*)*`,
	}

	normalizedPattern := strings.ToLower(strings.ReplaceAll(pattern, " ", ""))

	for _, dangerous := range dangerousPatterns {
		dangerousNormalized := strings.ToLower(strings.ReplaceAll(dangerous, " ", ""))
		if strings.Contains(normalizedPattern, dangerousNormalized) {
			return fmt.Errorf("התבנית מכילה quantifiers מקוננים שעלולים לגרום לבעיות ביצועים")
		}
	}

	if strings.Count(pattern, "+") > 5 || strings.Count(pattern, "*") > 5 {
		return fmt.Errorf("יותר מדי quantifiers בביטוי הרגולרי")
	}

	if strings.Count(pattern, "\\") > 20 {
		return fmt.Errorf("יותר מדי תווי escape בביטוי הרגולרי")
	}

	return nil
}

func compileRegexWithTimeout(pattern string, timeout time.Duration) (*regexp.Regexp, error) {
	type result struct {
		regex *regexp.Regexp
		err   error
	}

	resultChan := make(chan result, 1)

	go func() {
		regex, err := regexp.Compile(pattern)
		resultChan <- result{regex: regex, err: err}
	}()

	select {
	case res := <-resultChan:
		return res.regex, res.err
	case <-time.After(timeout):
		return nil, fmt.Errorf("קומפילציה של הביטוי הרגולרי ארכה יותר מדי")
	}
}

func matchWithTimeout(regex *regexp.Regexp, text, author string, timeout time.Duration) (bool, error) {
	type result struct {
		matched bool
		err     error
	}

	resultChan := make(chan result, 1)

	go func() {
		matched := regex.MatchString(text) || regex.MatchString(author)
		resultChan <- result{matched: matched, err: nil}
	}()

	select {
	case res := <-resultChan:
		return res.matched, res.err
	case <-time.After(timeout):
		return false, fmt.Errorf("regex matching ארך יותר מדי")
	}
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
	sort.Slice(messages, func(i, j int) bool {
		if descending {
			return messages[i].Timestamp.After(messages[j].Timestamp)
		}
		return messages[i].Timestamp.Before(messages[j].Timestamp)
	})
}

func searchMessages(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
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

	if req.DaysBack <= 0 {
		req.DaysBack = 365
	}
	if req.DaysBack > 1095 {
		req.DaysBack = 1095
	}

	isAdmin := userSession.Privileges[Admin]
	isAuthenticated := true
	isModerator := userSession.Privileges[Moderator]

	var results []Message
	var total int

	switch req.Mode {
	case "simple":
		results, total, err = searchMessagesSimple(ctx, req.Query, req.Limit, req.Offset, isAdmin, isAuthenticated, isModerator, req.DaysBack)
	case "advanced":
		results, total, err = searchMessagesAdvanced(ctx, req.Query, req.Limit, req.Offset, isAdmin, isAuthenticated, isModerator, req.DaysBack)
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
