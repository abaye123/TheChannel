package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"slices"
	"time"

	"firebase.google.com/go/v4/messaging"
	"github.com/appleboy/go-fcm"
)

var onNotification = os.Getenv("ON_NOTIFICATION") == "1"
var (
	vapidKey             = os.Getenv("VAPID")
	fcmApiKey            = os.Getenv("FCM_API_KEY")
	fcmAuthDomain        = os.Getenv("FCM_AUTH_DOMAIN")
	fcmProjectId         = os.Getenv("FCM_PROJECT_ID")
	fcmStorageBucket     = os.Getenv("FCM_STORAGE_BUCKET")
	fcmMessagingSenderId = os.Getenv("FCM_MESSAGING_SENDER_ID")
	fcmAppId             = os.Getenv("FCM_APP_ID")
	fcmMeasurementId     = os.Getenv("FCM_MEASUREMENT_ID")
	projectDomain        = os.Getenv("PROJECT_DOMAIN")
)

type FirebaseConfig struct {
	ApiKey            string `json:"apiKey"`
	AuthDomain        string `json:"authDomain"`
	DatabaseURL       string `json:"databaseURL"`
	ProjectId         string `json:"projectId"`
	StorageBucket     string `json:"storageBucket"`
	MessagingSenderId string `json:"messagingSenderId"`
	AppId             string `json:"appId"`
	MeasurementId     string `json:"measurementId"`
}
type NotificationsConfig struct {
	EnableNotifications bool           `json:"enableNotifications"`
	VAPID               string         `json:"vapid"`
	FirebaseConfig      FirebaseConfig `json:"firebaseConfig"`
}

func getNotificationsConfig(w http.ResponseWriter, r *http.Request) {
	response := NotificationsConfig{
		EnableNotifications: onNotification,
		VAPID:               vapidKey,
		FirebaseConfig: FirebaseConfig{
			ApiKey:            fcmApiKey,
			AuthDomain:        fcmAuthDomain,
			ProjectId:         fcmProjectId,
			StorageBucket:     fcmStorageBucket,
			MessagingSenderId: fcmMessagingSenderId,
			AppId:             fcmAppId,
			MeasurementId:     fcmMeasurementId,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func subscribeNotifications(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.Token == "" || len(req.Token) < 50 || len(req.Token) > 300 {
		http.Error(w, "Invalid token ", http.StatusBadRequest)
		return
	}

	if err := addSubscription(req.Token); err != nil {
		http.Error(w, "Failed to subscribe to notifications", http.StatusInternalServerError)
		return
	}

	var response Response
	response.Success = true

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func pushFcmMessage(m Message) {
	if !onNotification {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	list, err := getSubcriptionsList()
	if err != nil {
		return
	}

	if len(list) == 0 {
		return
	}

	channelName, err := getChannelDetails(ctx)
	if err != nil {
		return
	}

	client, err := fcm.NewClient(
		ctx,
		fcm.WithCredentialsFile("../thechannel-firebase-adminsdk.json"),
	)
	if err != nil {
		log.Println("Failed to create FCM client:", err)
		return
	}

	data := map[string]string{
		"url":   projectDomain,
		"title": channelName["name"],
		"body":  m.Text,
	}

	for chunk := range slices.Chunk(list, 500) {
		message := &messaging.MulticastMessage{
			Tokens: chunk,
			Data:   data,
		}

		_, err := client.SendMulticast(ctx, message)
		if err != nil {
			log.Println("Failed to send push notification:", err)
			return
		}
	}
}
