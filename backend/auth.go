package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/boj/redistore"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var secretKey string = os.Getenv("SECRET_KEY")
var store = &redistore.RediStore{}
var cookieName = "channel_session"
var requireAuthForAll = os.Getenv("REQUIRE_AUTH") == "1"
var adminUsers []string = strings.Split(os.Getenv("ADMIN_USERS"), ",")

var (
	googleOAuthScopes       = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
	googleOAuthUrl          = google.Endpoint.AuthURL
	googleOAuthClientId     = os.Getenv("GOOGLE_CLIENT_ID")
	googleOAuthClientSecret = os.Getenv("GOOGLE_CLIENT_SECRET")
)

type Privilege string
type Privileges map[Privilege]bool

const (
	Root      Privilege = "root"
	Admin     Privilege = "admin"
	Moderator Privilege = "moderator"
	Viewer    Privilege = "viewer"
)

type Auth struct {
	Code string `json:"code"`
}

type GoogleAuthValues struct {
	GoogleOauthUrl   string `json:"googleOauthUrl"`
	GoogleOauthScope string `json:"googleOauthScope"`
	GoogleClientId   string `json:"googleClientId"`
}

type Session struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin"`
	Picture  string `json:"picture,omitempty"`
}

type Response struct {
	Success bool `json:"success"`
}

func getGoogleAuthValues(w http.ResponseWriter, r *http.Request) {
	authValues := GoogleAuthValues{
		GoogleOauthUrl:   googleOAuthUrl,
		GoogleOauthScope: googleOAuthScopes,
		GoogleClientId:   googleOAuthClientId,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authValues)
}

func login(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var auth Auth

	if err := json.NewDecoder(r.Body).Decode(&auth); err != nil {
		http.Error(w, "error", http.StatusBadRequest)
	}

	if auth.Code == "" {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	origin := r.Header.Get("Origin")
	var googleOAuthConfig = &oauth2.Config{
		ClientID:     googleOAuthClientId,
		ClientSecret: googleOAuthClientSecret,
		RedirectURL:  origin + "/login",
		Endpoint:     google.Endpoint,
	}

	token, err := googleOAuthConfig.Exchange(ctx, auth.Code)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	if !token.Valid() {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	var claims jwt.MapClaims
	_, _, err = jwt.NewParser().ParseUnverified(token.Extra("id_token").(string), &claims)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	go registeringEmail(claims["email"].(string))

	id, _ := claims.GetSubject() // sub is the user ID in Google
	user := Session{
		ID:       id,
		Username: claims["name"].(string),
		IsAdmin:  isAdmin(claims["email"].(string)),
		Picture:  claims["picture"].(string),
	}

	session, _ := store.Get(r, cookieName)
	session.Values["user"] = user
	session.Options.MaxAge = 60 * 60 * 24 * 30 // 30 days
	if err := session.Save(r, w); err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	response := Response{Success: true}
	json.NewEncoder(w).Encode(response)
}

func isAdmin(s string) bool {
	return slices.Contains(adminUsers, s)
}

func logout(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, cookieName)

	session.Values["user"] = nil
	session.Options.MaxAge = -1
	err := session.Save(r, w)
	if err != nil {
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	response := Response{Success: true}
	json.NewEncoder(w).Encode(response)
}

func checkLogin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, _ := store.Get(r, cookieName)

		_, ok := session.Values["user"].(Session)
		if !ok {
			http.Error(w, "User not authenticated", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// TODO: Change to support different privileges by passing a permission type to checkPrivilege
func checkPrivilege(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, _ := store.Get(r, cookieName)

		s, _ := session.Values["user"].(Session)
		if !s.IsAdmin {
			http.Error(w, "User not privilege", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func getUserInfo(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, cookieName)
	userInfo, ok := session.Values["user"].(Session)
	if !ok {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userInfo)
}
