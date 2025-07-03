package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

var redisType = os.Getenv("REDIS_PROTOCOL")
var redisAddr = os.Getenv("REDIS_ADDR")
var redisPass = os.Getenv("REDIS_PASSWORD")
var rdb *redis.Client

type Message struct {
	ID        int          `json:"id" redis:"id"`
	Type      string       `json:"type" redis:"type"`
	Text      string       `json:"text" redis:"text"`
	Author    string       `json:"author" redis:"author"`
	Timestamp time.Time    `json:"timestamp" redis:"timestamp"`
	LastEdit  time.Time    `json:"lastEdit" redis:"last_edit"`
	File      FileResponse `json:"file" redis:"-"`
	Deleted   bool         `json:"deleted" redis:"deleted"`
	Views     int          `json:"views" redis:"views"`
}

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Password string `json:"-"`
	IsAdmin  bool   `json:"isAdmin"`
}

type PushMessage struct {
	Type string  `json:"type"`
	M    Message `json:"message"`
}

func init() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rdb = redis.NewClient(&redis.Options{
		Network:  redisType,
		Addr:     redisAddr,
		Password: redisPass,
		DB:       0,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Connection to db failed: %v \n", err)
	}

	log.Println("Connection to DB successful!")
}

func getMessageNextId(ctx context.Context) int {
	id, err := rdb.Incr(ctx, "message:next_id").Result()
	if err != nil {
		log.Fatalf("Failed to get id: %v\n", err)
	}

	return int(id)
}

func setMessage(ctx context.Context, m Message, isUpdate bool) error {
	messageKey := fmt.Sprintf("messages:%d", m.ID)

	// Set message in hash
	if err := rdb.HSet(ctx, messageKey, m).Err(); err != nil {
		return err
	}

	// Add message timestamp to sorted set
	if !isUpdate {
		if err := rdb.ZAdd(ctx, "m_times:1", redis.Z{Score: float64(m.Timestamp.Unix()), Member: messageKey}).Err(); err != nil {
			return err
		}
	}

	pushType := "new-message"
	if isUpdate {
		pushType = "edit-message"
	}

	pushMessage := PushMessage{
		Type: pushType,
		M:    m,
	}

	pushMessageData, _ := json.Marshal(pushMessage)
	rdb.Publish(ctx, "events", pushMessageData)

	return nil
}

var getMessageRange = redis.NewScript(`
	local time_set_key = KEYS[1]
	local offset_key = KEYS[2]

	local required_length = tonumber(ARGV[1])
	local isAdmin = ARGV[2] == 'true'

	local start_index = redis.call('ZREVRANK', time_set_key, offset_key) or 0
	if start_index > 0 then
		start_index = start_index + 1
	end

	local messages = {}
	repeat
		local batch_size = required_length - #messages
		local stop_index = start_index + batch_size
		local message_ids = redis.call('ZREVRANGE', time_set_key, start_index, stop_index)

		if #message_ids == 0 then
			break
		end

		for i, message_key in ipairs(message_ids) do
			local message_data = redis.call('HGETALL', message_key)
			local message = {}
	
			for j = 1, #message_data, 2 do
				local key = message_data[j]
				local value = message_data[j+1]
	
				if key == 'id' or key == 'views' then
					message[key] = tonumber(value)
				elseif key == 'deleted' then
					message[key] = value == '1'
				else
					message[key] = value
				end
			end
	
			if not message['deleted'] or isAdmin then
				table.insert(messages, message)
			end
		end

		start_index = start_index + batch_size

	until #messages >= required_length

	return cjson.encode(messages)
`)

func funcGetMessageRange(ctx context.Context, start, stop int64, isAdmin bool) ([]Message, error) {
	offsetKeyName := fmt.Sprintf("messages:%d", start)
	res, err := getMessageRange.Run(ctx, rdb, []string{"m_times:1", offsetKeyName}, []string{strconv.FormatInt(stop, 10), strconv.FormatBool(isAdmin)}).Result()
	if err != nil {
		return []Message{}, err
	}

	if res == "{}" {
		return []Message{}, nil
	}

	var messages []Message
	if err := json.Unmarshal([]byte(res.(string)), &messages); err != nil {
		return []Message{}, err
	}

	return messages, nil
}

func funcDeleteMessage(ctx context.Context, id string) error {
	msgKey := fmt.Sprintf("messages:%s", id)
	rdb.HSet(ctx, msgKey, "deleted", true)

	var m Message
	idInt, _ := strconv.Atoi(id)
	m.ID = idInt
	m.Deleted = true
	m.LastEdit = time.Now()
	m.Text = "*ההודעה נמחקה*"
	m.File = FileResponse{}

	pushMessage := PushMessage{
		Type: "delete-message",
		M:    m,
	}
	pushMessageData, _ := json.Marshal(pushMessage)
	rdb.Publish(ctx, "events", pushMessageData)

	return nil
}

func addViewsToMessages(ctx context.Context, messages []Message) {
	for _, m := range messages {
		rdb.HIncrBy(ctx, fmt.Sprintf("messages:%d", m.ID), "views", 1)
	}
}

// https://redis.io/docs/latest/operate/oss_and_stack/management/security/#string-escaping-and-nosql-injection
func addSubscription(token string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := rdb.SAdd(ctx, "subscriptions", token).Result()
	if err != nil {
		return err
	}

	return nil
}

func getSubcriptionsList() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	subscriptionsSet, err := rdb.SMembers(ctx, "subscriptions").Result()
	if err != nil {
		log.Printf("Failed to get subscriptions: %v\n", err)
		return []string{}, err
	}
	return subscriptionsSet, nil
}

func getChannelDetails() (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return rdb.HGetAll(ctx, "channel:1").Result()
}
