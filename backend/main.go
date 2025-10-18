package main

import (
	"bytes"
	"encoding/gob"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/boj/redistore"
	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
)

var rootStaticFolder = os.Getenv("ROOT_STATIC_FOLDER")

func protectedWithPrivilege(Privilege Privilege, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !checkPrivilege(r, Privilege) {
			http.Error(w, "User not authorized or not privilege", http.StatusUnauthorized)
			return
		}
		handler(w, r)
	}
}

func ifRequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check every time
		if settingConfig.RequireAuth {
			checkLogin(next).ServeHTTP(w, r)
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

func main() {
	gob.Register(Session{})
	initializePrivilegeUsers()

	loadFCMConfigFromEnv()

	var err error
	store, err = redistore.NewRediStore(10, redisType, redisAddr, "", redisPass, []byte(secretKey))
	if err != nil {
		panic(err)
	}
	store.SetMaxAge(60 * 60 * 24 * 30)
	store.Options.HttpOnly = true
	defer store.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)

	// Protected with api key
	// r.Post("/import/post", addNewPost)
	r.Post("/api/import/post", addNewPost)

	r.Get("/auth/google", getGoogleAuthValues)
	r.Post("/auth/login", login)
	r.Post("/auth/logout", logout)
	r.Get("/assets/favicon.ico", getFavicon)
	r.Get("/favicon.ico", getFavicon)
	r.Get("/api/channel/info-public", getChannelInfoPublic)
	r.Get("/api/files/{fileid}", serveFilePublic)

	r.Group(func(r chi.Router) {
		r.Use(checkLogin)
		r.Post("/api/reactions/set-reactions", setReactions)
		r.Post("/api/messages/report", reportMessage)
	})

	r.Group(func(r chi.Router) {
		r.Use(ifRequireAuth)
		r.Get("/firebase-messaging-sw.js", getFirebaseMessagingSW)
		r.Route("/api", func(api chi.Router) {
			api.Get("/ads/settings", getAdsSettings)
			api.Get("/emojis/list", getEmojisList)
			api.Get("/channel/notifications-config", getNotificationsConfig)
			api.Post("/channel/notifications-subscribe", subscribeNotifications)

			api.Get("/channel/info", getChannelInfo)
			api.Get("/messages", getMessages)
			api.Get("/events", getEvents)
			api.Get("/files/{fileid}", serveFile)
			api.Get("/user-info", getUserInfo)
			api.Get("/thread/{messageId}", getThreadRepliesHandler)
			api.Post("/search", searchMessages)

			api.Route("/admin", func(protected chi.Router) {
				// ⚠️ WARNING: Route not check privilege use protectedWithPrivilege to check privilege.

				protected.Post("/new", protectedWithPrivilege(Writer, addMessage))
				protected.Post("/edit-message", protectedWithPrivilege(Writer, updateMessage))
				protected.Get("/delete-message/{id}", protectedWithPrivilege(Writer, deleteMessage))
				protected.Post("/upload", protectedWithPrivilege(Writer, uploadFile))
				protected.Post("/edit-channel-info", protectedWithPrivilege(Moderator, editChannelInfo))
				protected.Get("/users-amount", protectedWithPrivilege(Moderator, getUsersAmount))
				protected.Post("/set-emojis", protectedWithPrivilege(Moderator, setEmojis))

				protected.Get("/privilegs-users/get-list", protectedWithPrivilege(Admin, getPrivilegeUsersList))
				protected.Post("/privilegs-users/set", protectedWithPrivilege(Admin, setPrivilegeUsers))
				protected.Get("/settings/get", protectedWithPrivilege(Admin, getSettings))
				protected.Post("/settings/set", protectedWithPrivilege(Admin, setSettings))
				protected.Get("/reports/get", protectedWithPrivilege(Admin, getReports))
				protected.Post("/reports/set", protectedWithPrivilege(Admin, setReports))

				protected.Post("/block-user", protectedWithPrivilege(Admin, blockUser))
				protected.Post("/unblock-user", protectedWithPrivilege(Admin, unblockUser))
				protected.Get("/blocked-users/get-list", protectedWithPrivilege(Admin, getBlockedUsers))
				protected.Get("/user-block-status", protectedWithPrivilege(Admin, getUserBlockStatus))

			 	// temporary
				protected.Get("/users/get-list", protectedWithPrivilege(Admin, getAllUsers))
			})
		})
	})

	if settingConfig.RootStaticFolder != "" {
		r.Handle("/assets/*", http.StripPrefix("/assets/", http.FileServer(http.Dir(settingConfig.RootStaticFolder))))
		r.NotFound(serveSpaFile)
	}

	if err := http.ListenAndServe(":"+os.Getenv("SERVER_PORT"), r); err != nil {
		log.Fatal(err)
	}
}

		
func serveSpaFile(w http.ResponseWriter, r *http.Request) {
	htmlPath := filepath.Join(settingConfig.RootStaticFolder, "index.html")
	content, err := os.ReadFile(htmlPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if settingConfig.CustomTitle != "" {
		content = bytes.ReplaceAll(content, []byte("<title></title>"), []byte(settingConfig.CustomTitle))
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(content)
}