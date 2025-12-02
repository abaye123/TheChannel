package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/icza/dyno"
)

type Channel struct {
	Id                          int       `json:"id"`
	Name                        string    `json:"name"`
	Description                 string    `json:"description"`
	LoginDescription            string    `json:"login_description"`
	CreatedAt                   time.Time `json:"created_at"`
	LogoUrl                     string    `json:"logoUrl"`
	ShowCredit                  bool      `json:"showCredit"`
	Views                       int64     `json:"views"`
	RequireAuthForViewFiles     bool      `json:"require_auth_for_view_files"`
	ThreadsEnabled              bool      `json:"threads_enabled"`
	ContactUs                   string    `json:"contact_us"`
	GoogleAnalyticsId           string    `json:"google_analytics_id"`
	HideMemberCountForNonAdmins bool      `json:"hide_member_count_for_non_admins"`
}

func getChannelInfo(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	amount, err := dbGetUsersAmount(ctx)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	amount, _ = dyno.GetInteger(amount)

	c, err := getChannelDetails(ctx)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	var channel Channel
	channel.Id, _ = strconv.Atoi(c["id"])
	channel.Name = c["name"]
	channel.Description = c["description"]
	channel.LoginDescription = c["login_description"]
	channel.CreatedAt, _ = time.Parse(time.RFC3339, c["created_at"])
	channel.LogoUrl = c["logoUrl"]
	channel.ShowCredit = os.Getenv("SHOW_CREDIT") != "false"
	channel.RequireAuthForViewFiles = settingConfig.RequireAuthForViewFiles
	channel.ThreadsEnabled = settingConfig.ThreadsEnabled
	channel.ContactUs = settingConfig.ContactUs
	channel.GoogleAnalyticsId = settingConfig.GoogleAnalyticsID
	channel.HideMemberCountForNonAdmins = settingConfig.HideMemberCountForNonAdmins

	// Check if user is admin
	user := r.Context().Value("user").(*User)
	isAdmin := user != nil && user.Privileges != nil && user.Privileges["admin"]

	// Set Views based on user's admin status and setting
	if settingConfig.HideMemberCountForNonAdmins && !isAdmin {
		channel.Views = 0
	} else {
		channel.Views = amount
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channel)
}

func getChannelInfoPublic(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	amount, err := dbGetUsersAmount(ctx)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	amount, _ = dyno.GetInteger(amount)

	c, err := getChannelDetails(ctx)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	var channel Channel
	channel.Id, _ = strconv.Atoi(c["id"])
	channel.Name = c["name"]
	channel.Description = c["description"]
	channel.LoginDescription = c["login_description"]
	channel.CreatedAt, _ = time.Parse(time.RFC3339, c["created_at"])
	channel.LogoUrl = c["logoUrl"]
	channel.HideMemberCountForNonAdmins = settingConfig.HideMemberCountForNonAdmins

	// For public endpoint (login page), hide member count if setting is enabled
	if settingConfig.HideMemberCountForNonAdmins {
		channel.Views = 0
	} else {
		channel.Views = amount
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channel)
}

func editChannelInfo(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	type Request struct {
		Name             string `json:"name"`
		Description      string `json:"description"`
		LoginDescription string `json:"login_description"`
		LogoUrl          string `json:"logoUrl"`
	}

	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	if _, err := rdb.HSet(ctx, "channel:1", "name", req.Name, "description", req.Description, "login_description", req.LoginDescription, "logoUrl", req.LogoUrl).Result(); err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	res := Response{Success: true}
	json.NewEncoder(w).Encode(res)
}

func registeringEmail(email string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rdb.SAdd(ctx, "registered_emails", email)
}

func getUsersAmount(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	amount, err := dbGetUsersAmount(ctx)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	response := struct {
		Amount int64 `json:"amount"`
	}{
		Amount: amount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
