# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder
WORKDIR /src

RUN apk add --no-cache build-base

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/canvas-server ./cmd/server

FROM alpine:3.21
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata sqlite-libs netcat-openbsd

COPY --from=builder /out/canvas-server /app/canvas-server
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /app/config /app/data

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
