import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketConfig, WebSocketMessage, WebSocketStatus, DEFAULT_WS_CONFIG } from '@/lib/websocket';

interface UseWebSocketReturn {
  status: WebSocketStatus;
  subscribe: (callback: (message: WebSocketMessage) => void) => () => void;
  isConnected: boolean;
}

export function useWebSocket(config: WebSocketConfig): UseWebSocketReturn {
  const [status, setStatus] = useState<WebSocketStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const subscribersRef = useRef<Set<(message: WebSocketMessage) => void>>(new Set());
  const isUnmountedRef = useRef(false);

  const { 
    url, 
    reconnectInterval = DEFAULT_WS_CONFIG.reconnectInterval,
    maxReconnectAttempts = DEFAULT_WS_CONFIG.maxReconnectAttempts,
    heartbeatInterval = DEFAULT_WS_CONFIG.heartbeatInterval,
  } = config;

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = undefined;
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setStatus('connecting');
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        setStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, heartbeatInterval);
      };

      ws.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        
        // Ignore pong responses
        if (event.data === 'pong') return;

        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          // Notify all subscribers
          subscribersRef.current.forEach(callback => {
            try {
              callback(message);
            } catch (error) {
              console.error('WebSocket subscriber error:', error);
            }
          });
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      // Browsers intentionally provide little detail on WebSocket error events.
      // Avoid console.error here to prevent noisy dev overlays, and surface
      // useful context via the close event instead.
      ws.onerror = (event) => {
        if (isUnmountedRef.current) return;
        // Keep status so UI can reflect an error state if needed
        setStatus('error');
        // Log as a warning with useful context that is actually available
        console.warn('WebSocket error event', {
          url,
          type: (event as Event).type,
          readyState: ws.readyState,
        });
      };

      ws.onclose = (event) => {
        if (isUnmountedRef.current) return;
        
        clearTimers();
        setStatus('disconnected');

        // Provide actionable diagnostics when a socket closes
        try {
          const { code, reason, wasClean } = event as CloseEvent;
          console.info('WebSocket closed', { code, reason, wasClean });
        } catch (_) {
          // no-op: environment may not expose CloseEvent fully
        }

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts!) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          console.warn('Max WebSocket reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setStatus('error');
    }
  }, [url, heartbeatInterval, reconnectInterval, maxReconnectAttempts, clearTimers]);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [clearTimers]);

  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    subscribersRef.current.add(callback);
    
    // Return unsubscribe function
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    subscribe,
    isConnected: status === 'connected',
  };
}
