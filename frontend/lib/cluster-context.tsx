"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWebSocket, type WebSocketMessage } from "@/hooks/useWebSocket";
import { type Cluster, useClusterStore } from "@/lib/store/cluster-store";

/**
 * Zustand 版本的 ClusterProvider：把集群/WS 状态统一进 store，Provider 只负责 side-effects/bridge。
 */
export function ClusterProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const refreshClusters = useClusterStore((s) => s.refreshClusters);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const clusters = useClusterStore((s) => s.clusters);

  // WebSocket bridge
  const setWs = useClusterStore((s) => s._setWebSocketState);
  const setUpdates = useClusterStore((s) => s._setResourceUpdates);
  const setReconnect = useClusterStore((s) => s._setReconnectWebSocket);

  const [updates, setUpdatesState] = useState<WebSocketMessage[]>([]);
  const { isConnected, isConnecting, isPolling, error, reconnect, subscribe, addMessageHandler, removeMessageHandler } = useWebSocket();

  const currentCluster = useMemo(() => {
    if (!clusters.length) return null;
    return clusters.find((c) => c.id === activeClusterId) || clusters.find((c) => c.is_active) || null;
  }, [clusters, activeClusterId]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      void refreshClusters();
    } else {
      useClusterStore.setState({
        clusters: [],
        activeClusterId: null,
        isLoading: false,
        wsConnected: false,
        wsConnecting: false,
        wsPolling: false,
        wsError: null,
        resourceUpdates: [],
      });
    }
  }, [authLoading, isAuthenticated, refreshClusters]);

  useEffect(() => {
    setWs({ connected: isConnected, connecting: isConnecting, polling: isPolling, error: error ?? null });
  }, [isConnected, isConnecting, isPolling, error, setWs]);

  useEffect(() => {
    setUpdates(updates);
  }, [updates, setUpdates]);

  useEffect(() => {
    const handler = (message: WebSocketMessage) => {
      setUpdatesState((prev) => [...prev.slice(-49), message]);
    };

    addMessageHandler("resource_update", handler);
    return () => {
      removeMessageHandler("resource_update");
    };
  }, [addMessageHandler, removeMessageHandler]);

  useEffect(() => {
    setReconnect(() => reconnect);
  }, [reconnect, setReconnect]);

  useEffect(() => {
    if (!isConnected || !currentCluster || !subscribe) return;
    subscribe({ cluster_id: currentCluster.id });
  }, [isConnected, currentCluster, subscribe]);

  useEffect(() => {
    if (!isAuthenticated || !isPolling) return;
    const timer = setInterval(() => {
      void refreshClusters();
    }, 15000);
    return () => clearInterval(timer);
  }, [isAuthenticated, isPolling, refreshClusters]);

  return children;
}

export type { Cluster };

export function useCluster() {
  const clusters = useClusterStore((s) => s.clusters);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const isLoading = useClusterStore((s) => s.isLoading);

  const setActiveCluster = useClusterStore((s) => s.setActiveCluster);
  const refreshClusters = useClusterStore((s) => s.refreshClusters);
  const toggleClusterActive = useClusterStore((s) => s.toggleClusterActive);

  const wsConnected = useClusterStore((s) => s.wsConnected);
  const wsConnecting = useClusterStore((s) => s.wsConnecting);
  const wsPolling = useClusterStore((s) => s.wsPolling);
  const wsError = useClusterStore((s) => s.wsError);
  const resourceUpdates = useClusterStore((s) => s.resourceUpdates);
  const reconnectWebSocket = useClusterStore((s) => s.reconnectWebSocket);

  const activeCluster = useMemo(() => {
    if (!clusters.length) return null;
    return clusters.find((c) => c.id === activeClusterId) || clusters.find((c) => c.is_active) || null;
  }, [clusters, activeClusterId]);

  const selectedCluster = activeCluster?.id ?? null;
  const currentCluster = activeCluster;

  return {
    clusters,
    activeCluster,
    selectedCluster,
    setActiveCluster,
    refreshClusters,
    toggleClusterActive,
    isLoading,
    wsConnected,
    wsConnecting,
    wsPolling,
    wsError,
    resourceUpdates,
    reconnectWebSocket,
    currentCluster,
  };
}
