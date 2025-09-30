// WebSocket configuration and utilities

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL ?? 
  (typeof window !== 'undefined' 
    ? `ws://${window.location.hostname}:8000` 
    : 'ws://localhost:8000');

export const WS_ENDPOINTS = {
  deployments: `${WS_BASE_URL}/ws/deployments`,
} as const;

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export const DEFAULT_WS_CONFIG: Omit<WebSocketConfig, 'url'> = {
  reconnectInterval: 3000, // 3 seconds
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000, // 30 seconds
};

export type WebSocketEventType =
  | 'deployment_added'
  | 'deployment_modified'
  | 'deployment_deleted'
  | 'statefulset_added'
  | 'statefulset_modified'
  | 'statefulset_deleted'
  | 'job_added'
  | 'job_modified'
  | 'job_deleted'
  | 'cronjob_added'
  | 'cronjob_modified'
  | 'cronjob_deleted'
  | 'pod_added'
  | 'pod_modified'
  | 'pod_deleted';

export interface WebSocketMessage {
  type: WebSocketEventType;
  resource_type: string;
  namespace: string;
  name: string;
  data: Record<string, any> | null;
}

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
