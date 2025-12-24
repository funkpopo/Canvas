"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWebSocket, useResourceUpdates } from "@/hooks/useWebSocket";
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

  const { isConnected, isConnecting, error, reconnect, subscribe } = useWebSocket();
  const { updates } = useResourceUpdates();

  const currentCluster = useMemo(() => {
    if (!clusters.length) return null;
    return clusters.find((c) => c.id === activeClusterId) || clusters.find((c) => c.is_active) || null;
  }, [clusters, activeClusterId]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      void refreshClusters();
    } else {
      useClusterStore.setState({ clusters: [], activeClusterId: null, isLoading: false });
    }
  }, [authLoading, isAuthenticated, refreshClusters]);

  useEffect(() => {
    setWs({ connected: isConnected, connecting: isConnecting, error: error ?? null });
  }, [isConnected, isConnecting, error, setWs]);

  useEffect(() => {
    setUpdates(updates);
  }, [updates, setUpdates]);

  useEffect(() => {
    setReconnect(() => reconnect);
  }, [reconnect, setReconnect]);

  useEffect(() => {
    if (!isConnected || !currentCluster || !subscribe) return;
    subscribe({ cluster_id: currentCluster.id });
  }, [isConnected, currentCluster, subscribe]);

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
    wsError,
    resourceUpdates,
    reconnectWebSocket,
    currentCluster,
  };
}
