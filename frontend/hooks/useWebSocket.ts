import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../lib/auth-context';
import { useCluster } from '../lib/cluster-context';

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
}

const WS_BASE_URL = 'ws://localhost:8000/api/ws';

export function useWebSocket(): WebSocketHookReturn {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3秒

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
  const connect = useCallback(() => {
    if (!token || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      const wsUrl = `${WS_BASE_URL}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
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
            case 'ping':
              // 响应心跳
              sendMessage({ type: 'pong', data: { timestamp: new Date().toISOString() } });
              break;
            case 'status':
              console.log('WebSocket status:', message.data);
              break;
            case 'error':
              console.error('WebSocket error:', message.data);
              setError(message.data.message || 'WebSocket error');
              break;
            case 'subscription_ack':
              console.log('Subscription acknowledged:', message.data);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // 如果不是正常关闭，尝试重连
        if (event.code !== 1000 && event.code !== 1008) {
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to create WebSocket connection');
      setIsConnecting(false);
      scheduleReconnect();
    }
  }, [token]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
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
      connect();
    }, delay);
  }, [connect]);

  // 手动重连
  const reconnect = useCallback(() => {
    console.log('Manual reconnect requested');
    disconnect();
    reconnectAttempts.current = 0;
    setTimeout(() => connect(), 100);
  }, [disconnect, connect]);

  // 发送消息
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
        setError('Failed to send message');
      }
    } else {
      console.warn('WebSocket is not connected, cannot send message');
    }
  }, []);

  // 订阅资源更新
  const subscribe = useCallback((options: SubscriptionOptions) => {
    sendMessage({
      type: 'subscription',
      data: {
        action: 'subscribe',
        ...options
      }
    });
  }, [sendMessage]);

  // 取消订阅
  const unsubscribe = useCallback((options: SubscriptionOptions) => {
    sendMessage({
      type: 'subscription',
      data: {
        action: 'unsubscribe',
        ...options
      }
    });
  }, [sendMessage]);

  // 监听认证状态变化
  useEffect(() => {
    if (token && !isConnected && !isConnecting) {
      connect();
    } else if (!token && isConnected) {
      disconnect();
    }
  }, [token, isConnected, isConnecting, connect, disconnect]);


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
      if (message.type === 'resource_update') {
        // 如果指定了资源类型，只处理匹配的更新
        if (!resourceType || message.data.resource_type === resourceType) {
          setUpdates(prev => [...prev.slice(-49), message]); // 保留最近50条更新
        }
      }
    };

    addMessageHandler('resource_update', handler);

    return () => {
      removeMessageHandler('resource_update');
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
