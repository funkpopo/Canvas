import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/store/auth-store";

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export interface SubscriptionOptions {
  cluster_id?: number;
  namespace?: string;
  resource_type?: string;
}

export interface WebSocketHookReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  subscribe: (options: SubscriptionOptions) => void;
  unsubscribe: (options: SubscriptionOptions) => void;
  sendMessage: (message: any) => void;
  reconnect: () => void;
  addMessageHandler: (type: string, handler: (message: WebSocketMessage) => void) => void;
  removeMessageHandler: (type: string) => void;
}

// 从 API 基址动态构造 WebSocket URL（兼容 NEXT_PUBLIC_API_URL 为相对路径 `/api`）
const getWebSocketBaseUrl = (): string => {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit && typeof explicit === "string") {
    return explicit.replace(/\/$/, "");
  }

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");

  // 绝对 URL：http(s)://host/api -> ws(s)://host/api/ws
  if (/^https?:\/\//.test(apiUrl)) {
    return apiUrl.replace(/^http/, "ws").replace(/\/api$/, "/api/ws");
  }

  // 相对 URL：HTTP 走 Next rewrites，但 WebSocket 不走 rewrites，因此默认连后端 8000 端口
  const loc = typeof window !== "undefined" ? window.location : null;
  const proto = loc && loc.protocol === "https:" ? "wss" : "ws";
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "8000";
  const host = loc ? `${loc.hostname}:${wsPort}` : "localhost:8000";
  const basePath = apiUrl === "/api" ? "/api/ws" : `${apiUrl}/ws`;
  return `${proto}://${host}${basePath}`;
};

export function useWebSocket(): WebSocketHookReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectingRef = useRef(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3秒

  const getValidAccessToken = useAuthStore((s) => s.getValidAccessToken);

  // 消息处理器
  const messageHandlers = useRef<Map<string, (message: WebSocketMessage) => void>>(new Map());

  // 注册消息处理器
  const addMessageHandler = useCallback((type: string, handler: (message: WebSocketMessage) => void) => {
    messageHandlers.current.set(type, handler);
  }, []);

  // 移除消息处理器
  const removeMessageHandler = useCallback((type: string) => {
    messageHandlers.current.delete(type);
  }, []);

  // 连接WebSocket
  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    setIsConnecting(true);
    setError(null);

    // 连接前确保 access token 有效（即将过期则先刷新）
    const token = await getValidAccessToken({ skewSeconds: 60 });
    if (!token) {
      setIsConnecting(false);
      connectingRef.current = false;
      setError("Authentication required. Please login again.");
      return;
    }

    try {
      const wsBase = getWebSocketBaseUrl();
      const wsUrl = `${wsBase}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setIsConnecting(false);
        connectingRef.current = false;
        setError(null);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          // 调用对应的消息处理器
          const handler = messageHandlers.current.get(message.type);
          if (handler) {
            handler(message);
          }

          // 处理特殊消息类型
          switch (message.type) {
            case "ping":
              // 响应心跳
              sendMessage({ type: "pong", data: { timestamp: new Date().toISOString() } });
              break;
            case "status":
              console.log("WebSocket status:", message.data);
              break;
            case "error":
              console.error("WebSocket error:", message.data);
              setError(message.data.message || "WebSocket error");
              break;
            case "subscription_ack":
              console.log("Subscription acknowledged:", message.data);
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        connectingRef.current = false;
        wsRef.current = null;

        // 如果不是正常关闭，尝试重连
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setError("WebSocket connection error");
        setIsConnecting(false);
        connectingRef.current = false;
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to create WebSocket connection:", err);
      setError("Failed to create WebSocket connection");
      setIsConnecting(false);
      connectingRef.current = false;
      scheduleReconnect();
    }
  }, [getValidAccessToken]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    connectingRef.current = false;
    reconnectAttempts.current = 0;
  }, []);

  // 计划重连
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      return;
    }

    reconnectAttempts.current += 1;
    const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current - 1); // 指数退避

    console.log(`Scheduling reconnect attempt ${reconnectAttempts.current} in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(() => {
      void connect();
    }, delay);
  }, [connect]);

  // 手动重连
  const reconnect = useCallback(() => {
    console.log("Manual reconnect requested");
    disconnect();
    reconnectAttempts.current = 0;
    setTimeout(() => void connect(), 100);
  }, [disconnect, connect]);

  // 发送消息
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
        console.error("Failed to send WebSocket message:", err);
        setError("Failed to send message");
      }
    } else {
      console.warn("WebSocket is not connected, cannot send message");
    }
  }, []);

  // 订阅资源更新
  const subscribe = useCallback((options: SubscriptionOptions) => {
    sendMessage({
      type: "subscription",
      data: {
        action: "subscribe",
        ...options
      }
    });
  }, [sendMessage]);

  // 取消订阅
  const unsubscribe = useCallback((options: SubscriptionOptions) => {
    sendMessage({
      type: "subscription",
      data: {
        action: "unsubscribe",
        ...options
      }
    });
  }, [sendMessage]);

  const storeToken = useAuthStore((s) => s.token);

  // 监听认证状态变化
  useEffect(() => {
    const hasToken = storeToken ?? (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    if (hasToken && !isConnected && !isConnecting) {
      void connect();
    } else if (!hasToken && isConnected) {
      disconnect();
    }
  }, [storeToken, isConnected, isConnecting, connect, disconnect]);


  // 清理副作用
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    subscribe,
    unsubscribe,
    sendMessage,
    reconnect,
    // 内部方法暴露给需要自定义处理的应用
    addMessageHandler,
    removeMessageHandler,
  };
}

// 资源更新钩子 - 专门用于处理资源更新消息
export function useResourceUpdates(resourceType?: string) {
  const [updates, setUpdates] = useState<WebSocketMessage[]>([]);
  const { addMessageHandler, removeMessageHandler, subscribe, unsubscribe } = useWebSocket() as any;

  useEffect(() => {
    const handler = (message: WebSocketMessage) => {
      if (message.type === "resource_update") {
        // 如果指定了资源类型，只处理匹配的更新
        if (!resourceType || message.data.resource_type === resourceType) {
          setUpdates(prev => [...prev.slice(-49), message]); // 保留最近50条更新
        }
      }
    };

    addMessageHandler("resource_update", handler);

    return () => {
      removeMessageHandler("resource_update");
    };
  }, [resourceType, addMessageHandler, removeMessageHandler]);

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  return {
    updates,
    clearUpdates,
    subscribe,
    unsubscribe,
  };
}
