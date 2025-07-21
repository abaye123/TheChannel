package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type ReplaceRegex struct {
	Pattern *regexp.Regexp
	Replace string
}

type SettingConfig struct {
	AdSrc        string
	AdWidth      int
	RegexReplace []*ReplaceRegex
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

	for _, setting := range *s {
		switch setting.Key {
		case "ad-iframe-src":
			config.AdSrc = setting.GetString()
		case "ad-iframe-width":
			log.Println("Setting ad-iframe-width to", setting)
			config.AdWidth = setting.GetInt()
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
		}
	}

	return config
}

func (s *Setting) GetBool() bool {
	if boolValue, ok := s.Value.(bool); ok {
		return boolValue
	}
	return false
}

func (s *Setting) GetString() string {
	if strValue, ok := s.Value.(string); ok {
		return strValue
	}
	return ""
}

func (s *Setting) GetInt() int {
	if intValue, ok := s.Value.(int); ok {
		return intValue
	}
	i, err := strconv.Atoi(s.Value.(string))
	if err == nil {
		return i
	}

	return 0
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
