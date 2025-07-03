FROM node:20 as build

WORKDIR /app
COPY ./frontend .
RUN chmod +x ./generate-firebase-messaging-sw.sh  \
    && ./generate-firebase-messaging-sw.sh \
    && npm install \
    && npm run build

FROM golang:1.24 AS builder

WORKDIR /app

COPY ./backend .
#COPY --from=build /app/dist/channel/browser assets
RUN go mod tidy
RUN go build -o the-channel .

FROM debian:latest
WORKDIR /app
COPY --from=builder /app/the-channel . 
COPY --from=build /app/dist/channel/browser /usr/share/ng
COPY ./thechannel-firebase-adminsdk.json  .
RUN chmod +x the-channel
CMD ["./the-channel"]
