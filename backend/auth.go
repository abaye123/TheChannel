package main

import (
	"encoding/json"
	"net/http"
	"os"
	"slices"
	"strings"

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
var googleOAuthConfig = &oauth2.Config{
	ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
	ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
	RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URI"),
	Endpoint:     google.Endpoint,
}
var googleOAuthScopes = os.Getenv("GOOGLE_OAUTH_SCOPES")
var googleOAuthUrl = os.Getenv("GOOGLE_OAUTH_URL")

type Auth struct {
	Code string `json:"code"`
}

type GoogleAuthValues struct {
	GoogleOauthUrl    string `json:"googleOauthUrl"`
	GoogleOauthScope  string `json:"googleOauthScope"`
	GoogleClientId    string `json:"googleClientId"`
	GoogleRedirectUri string `json:"googleRedirectUri"`
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
		GoogleOauthUrl:    googleOAuthUrl,
		GoogleOauthScope:  googleOAuthScopes,
		GoogleClientId:    googleOAuthConfig.ClientID,
		GoogleRedirectUri: googleOAuthConfig.RedirectURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authValues)
}

func login(w http.ResponseWriter, r *http.Request) {
	var auth Auth

	if err := json.NewDecoder(r.Body).Decode(&auth); err != nil {
		http.Error(w, "error", http.StatusBadRequest)
	}

	if auth.Code == "" {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := googleOAuthConfig.Exchange(r.Context(), auth.Code)
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
