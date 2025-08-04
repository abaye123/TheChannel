package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/icza/dyno"
)

type ReplaceRegex struct {
	Pattern *regexp.Regexp
	Replace string
}

type SettingConfig struct {
	AdSrc                     string
	AdWidth                   int64
	RequireAuth               bool
	RequireAuthForViewFiles   bool
	RegexReplace              []*ReplaceRegex
	WebhookURL                string
	VerifyToken               string
	ApiSecretKey              string
	RootStaticFolder          string
	CountViews                bool
	ShowAuthorToAuthenticated bool
	AutoGrantWriterPrivilege  bool
	GoogleAnalyticsID         string
	HideEditTime              bool
	OnNotification            bool
	VAPID                     string
	FcmApiKey                 string
	FcmAuthDomain             string
	FcmProjectId              string
	FcmStorageBucket          string
	FcmMessagingSenderId      string
	FcmAppId                  string
	FcmMeasurementId          string
	ProjectDomain             string
	MaxFileSize               int64
	EditTimeLimit             int64
}

type Setting struct {
	Key   string `json:"key"`
	Value any    `json:"value"`
}

var settingConfig *SettingConfig

type Settings []Setting

func init() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	s, err := dbGetSettings(ctx)
	if err != nil {
		panic("Failed to load settings from database: " + err.Error())
	}

	settingConfig = s.ToConfig()
}

func (s *Settings) ToConfig() *SettingConfig {
	config := &SettingConfig{}

	if rootStaticFolder != "" {
		config.RootStaticFolder = rootStaticFolder
	} else {
		config.RootStaticFolder = "/usr/share/ng"
	}

	config.MaxFileSize = 50
	config.EditTimeLimit = 120

	for _, setting := range *s {
		switch setting.Key {
		case "ad-iframe-src":
			config.AdSrc = setting.GetString()

		case "ad-iframe-width":
			config.AdWidth = setting.GetInt()

		case "require_auth":
			config.RequireAuth = setting.GetBool()
			
		case "require_auth_for_view_files":
			config.RequireAuthForViewFiles = setting.GetBool()

		case "webhook_url":
			config.WebhookURL = setting.GetString()

		case "webhook_verify_token":
			config.VerifyToken = setting.GetString()

		case "api_secret_key":
			config.ApiSecretKey = setting.GetString()

		case "count_views":
			config.CountViews = setting.GetBool()

		case "show_author_to_authenticated":
			config.ShowAuthorToAuthenticated = setting.GetBool()

		case "auto_grant_writer_privilege":
			config.AutoGrantWriterPrivilege = setting.GetBool()

		case "hide_edit_time":
			config.HideEditTime = setting.GetBool()

		case "google_analytics_id":
			config.GoogleAnalyticsID = setting.GetString()
			
		case "regex-replace":
			if r := setting.GetString(); r != "" {
				parts := strings.Split(r, "#")
				if len(parts) == 2 {
					if r, err := regexp.Compile(parts[0]); err == nil {
						config.RegexReplace = append(config.RegexReplace, &ReplaceRegex{
							Pattern: r,
							Replace: parts[1],
						})
					}
				}
			}

		case "on_notification":
			config.OnNotification = setting.GetBool()

		case "vapid":
			config.VAPID = setting.GetString()

		case "fcm_api_key":
			config.FcmApiKey = setting.GetString()

		case "fcm_auth_domain":
			config.FcmAuthDomain = setting.GetString()

		case "fcm_project_id":
			config.FcmProjectId = setting.GetString()

		case "fcm_storage_bucket":
			config.FcmStorageBucket = setting.GetString()

		case "fcm_messaging_sender_id":
			config.FcmMessagingSenderId = setting.GetString()

		case "fcm_app_id":
			config.FcmAppId = setting.GetString()

		case "fcm_measurement_id":
			config.FcmMeasurementId = setting.GetString()

		case "project_domain":
			config.ProjectDomain = setting.GetString()

		case "max_file_size":
			requestedSize := setting.GetInt()
			// Check if there's an environment variable limit
			if envMaxSize := os.Getenv("MAX_FILE_SIZE"); envMaxSize != "" {
				if envLimit, err := strconv.ParseInt(envMaxSize, 10, 64); err == nil {
					// If the requested size is higher than the env limit, use the env limit
					if requestedSize > envLimit {
						config.MaxFileSize = envLimit
					} else {
						config.MaxFileSize = requestedSize
					}
				} else {
					config.MaxFileSize = requestedSize
				}
			} else {
				config.MaxFileSize = requestedSize
			}

		case "edit_time_limit":
			timeLimit := setting.GetInt()
			if timeLimit > 0 {
				config.EditTimeLimit = timeLimit
			}
		}
	}

	// Also check the default value against environment limit
	if envMaxSize := os.Getenv("MAX_FILE_SIZE"); envMaxSize != "" {
		if envLimit, err := strconv.ParseInt(envMaxSize, 10, 64); err == nil {
			// If the current MaxFileSize (default 50) is higher than env limit, use env limit
			if config.MaxFileSize > envLimit {
				config.MaxFileSize = envLimit
			}
		}
	}

	return config
}

func (s *Setting) GetBool() bool {
	b, _ := dyno.GetBoolean(s.Value)
	return b
}

func (s *Setting) GetString() string {
	str, _ := dyno.GetString(s.Value)
	return str
}

func (s *Setting) GetInt() int64 {
	i, _ := dyno.GetInteger(s.Value)
	return i
}

func setSettings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var newSettings Settings
	if err := json.NewDecoder(r.Body).Decode(&newSettings); err != nil {
		http.Error(w, "error decoding settings", http.StatusBadRequest)
		return
	}

	if err := dbSetSettings(ctx, &newSettings); err != nil {
		http.Error(w, "error saving settings", http.StatusInternalServerError)
		return
	}

	settingConfig = newSettings.ToConfig()

	res := Response{
		Success: true,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func getSettings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	s, err := dbGetSettings(ctx)
	if err != nil {
		http.Error(w, "error getting settings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}
