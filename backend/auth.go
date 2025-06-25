package main

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/boj/redistore"
)

var secretKey string = os.Getenv("SECRET_KEY")
var defaultUser string = os.Getenv("DEFAULT_USER")
var defaultPassword string = os.Getenv("DEFAULT_PASSWORD")
var defaultUserName string = os.Getenv("DEFAULT_USERNAME")
var store = &redistore.RediStore{}
var cookieName = "channel_session"
var requireAuthForAll bool = false

type Auth struct {
	UserName string
	Password string
}

type Session struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin"`
}

type Response struct {
	Success bool `json:"success"`
}

func login(w http.ResponseWriter, r *http.Request) {
	var auth Auth

	if err := json.NewDecoder(r.Body).Decode(&auth); err != nil {
		http.Error(w, "error", http.StatusBadRequest)
	}

	if auth.UserName != defaultUser || auth.Password != defaultPassword {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	user := Session{
		ID:       1,
		Username: defaultUserName,
		IsAdmin:  true,
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
