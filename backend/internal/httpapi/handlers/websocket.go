package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"github.com/gorilla/websocket"
)

type wsClient struct {
	conn          *websocket.Conn
	username      string
	subscriptions map[string]struct{}
	writeMu       sync.Mutex
}

type wsIncomingMessage struct {
	Type string                 `json:"type"`
	Data map[string]interface{} `json:"data"`
}

type wsOutgoingMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp string      `json:"timestamp"`
}

type WebsocketHandler struct {
	mu       sync.RWMutex
	clients  map[*websocket.Conn]*wsClient
	upgrader websocket.Upgrader
}

func NewWebsocketHandler() *WebsocketHandler {
	return &WebsocketHandler{
		clients: make(map[*websocket.Conn]*wsClient),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// 浏览器 WebSocket 不受 CORS 中间件控制，这里允许跨源连接。
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}
}

func (h *WebsocketHandler) Connect(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.CurrentUser(r)
	if !ok || user == nil {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &wsClient{
		conn:          conn,
		username:      user.Username,
		subscriptions: map[string]struct{}{},
	}
	h.registerClient(client)
	defer h.unregisterClient(client)

	_ = h.writeJSON(client, wsOutgoingMessage{
		Type:      "status",
		Data:      map[string]interface{}{"state": "connected"},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})

	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(_ string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for range ticker.C {
			if err := h.writeJSON(client, wsOutgoingMessage{
				Type:      "ping",
				Data:      map[string]string{"status": "alive"},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			}); err != nil {
				return
			}
		}
	}()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var incoming wsIncomingMessage
		if err := json.Unmarshal(payload, &incoming); err != nil {
			_ = h.writeJSON(client, wsOutgoingMessage{
				Type:      "error",
				Data:      map[string]string{"message": "invalid message payload"},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			continue
		}

		switch strings.TrimSpace(incoming.Type) {
		case "subscription":
			h.updateSubscription(client, incoming.Data)
			_ = h.writeJSON(client, wsOutgoingMessage{
				Type:      "subscription_ack",
				Data:      incoming.Data,
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
		case "pong":
			_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		default:
			_ = h.writeJSON(client, wsOutgoingMessage{
				Type: "error",
				Data: map[string]string{
					"message": "unsupported message type",
				},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
		}
	}

	<-done
}

func (h *WebsocketHandler) Stats(w http.ResponseWriter, r *http.Request) {
	connections, users, rooms := h.snapshotStats()
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"connections":         connections,
		"authenticated_users": users,
		"rooms":               rooms,
	})
}

func (h *WebsocketHandler) registerClient(client *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.conn] = client
}

func (h *WebsocketHandler) unregisterClient(client *wsClient) {
	h.mu.Lock()
	delete(h.clients, client.conn)
	h.mu.Unlock()
	_ = client.conn.Close()
}

func (h *WebsocketHandler) writeJSON(client *wsClient, payload wsOutgoingMessage) error {
	client.writeMu.Lock()
	defer client.writeMu.Unlock()
	return client.conn.WriteJSON(payload)
}

func (h *WebsocketHandler) updateSubscription(client *wsClient, data map[string]interface{}) {
	action := strings.ToLower(strings.TrimSpace(stringValue(data["action"])))
	room := normalizeRoom(data)
	if room == "" {
		return
	}

	switch action {
	case "unsubscribe":
		delete(client.subscriptions, room)
	default:
		client.subscriptions[room] = struct{}{}
	}
}

func (h *WebsocketHandler) snapshotStats() (int, int, int) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	userSet := make(map[string]struct{})
	roomSet := make(map[string]struct{})

	for _, client := range h.clients {
		userSet[client.username] = struct{}{}
		for room := range client.subscriptions {
			roomSet[room] = struct{}{}
		}
	}

	return len(h.clients), len(userSet), len(roomSet)
}

func normalizeRoom(data map[string]interface{}) string {
	if len(data) == 0 {
		return ""
	}
	clusterID := strings.TrimSpace(stringValue(data["cluster_id"]))
	namespace := strings.TrimSpace(stringValue(data["namespace"]))
	resourceType := strings.TrimSpace(stringValue(data["resource_type"]))
	if clusterID == "" && namespace == "" && resourceType == "" {
		return ""
	}
	return "cluster=" + clusterID + ";namespace=" + namespace + ";resource=" + resourceType
}

func stringValue(raw interface{}) string {
	switch v := raw.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	default:
		return ""
	}
}
