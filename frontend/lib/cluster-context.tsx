"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { clusterApi } from './api';
import { useWebSocket, useResourceUpdates } from '../hooks/useWebSocket';

interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  is_active: boolean;
}

interface ClusterContextType {
  clusters: Cluster[];
  activeCluster: Cluster | null;
  selectedCluster: number | null; // 当前选中集群的ID
  setActiveCluster: (cluster: Cluster | null) => Promise<void>;
  refreshClusters: () => Promise<void>;
  toggleClusterActive: (clusterId: number) => Promise<boolean>;
  isLoading: boolean;
  // WebSocket相关
  wsConnected: boolean;
  wsConnecting: boolean;
  wsError: string | null;
  resourceUpdates: any[];
  reconnectWebSocket: () => void;
  currentCluster: Cluster | null; // 重命名activeCluster为currentCluster以保持一致性
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [activeCluster, _setActiveClusterLocal] = useState<Cluster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // WebSocket相关状态
  const { isConnected: wsConnected, isConnecting: wsConnecting, error: wsError, reconnect, subscribe } = useWebSocket();
  const { updates: resourceUpdates } = useResourceUpdates();

  // 获取当前集群（兼容旧的activeCluster命名）
  const currentCluster = activeCluster;

  // 获取当前选中的集群ID（用于兼容性）
  const selectedCluster = activeCluster?.id ?? null;

  const fetchClusters = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.log("ClusterContext: No token found");
        setClusters([]);
        _setActiveClusterLocal(null);
        setIsLoading(false);
        return;
      }

      const response = await clusterApi.getClusters();

      if (response.data) {
        console.log("ClusterContext: Loaded", response.data.length, "clusters");
        setClusters(response.data);
        const preferredIdRaw = localStorage.getItem("activeClusterId");
        const preferredId = preferredIdRaw ? parseInt(preferredIdRaw, 10) : null;

        const serverActive = response.data.find((c: Cluster) => c.is_active) || null;
        const preferredActive =
          preferredId ? response.data.find((c: Cluster) => c.id === preferredId && c.is_active) || null : null;

        const nextActive = preferredActive || serverActive;
        _setActiveClusterLocal(nextActive);
      } else {
        console.error("ClusterContext: Failed to fetch clusters, error:", response.error);
        setClusters([]);
        _setActiveClusterLocal(null);
      }
    } catch (error) {
      console.error("ClusterContext: 获取集群列表失败:", error);
      setClusters([]);
      _setActiveClusterLocal(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshClusters = useCallback(async () => {
    setIsLoading(true);
    await fetchClusters();
  }, [fetchClusters]);

  // 将指定集群设为唯一激活（前后端一致）
  const setActiveCluster = useCallback(async (cluster: Cluster | null) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (!cluster) {
      _setActiveClusterLocal(null);
      localStorage.removeItem("activeClusterId");
      return;
    }

    try {
      // 先设置本地状态，避免UI闪烁
      _setActiveClusterLocal(cluster);
      localStorage.setItem("activeClusterId", String(cluster.id));

      // 使用后端专用激活接口（避免对所有集群逐个 update）
      await clusterApi.activateCluster(cluster.id);

      await refreshClusters();
    } catch (err) {
      console.error("设置激活集群失败:", err);
      // 失败时恢复到之前的活跃集群状态
      await refreshClusters();
    }
  }, [refreshClusters]);

  const toggleClusterActive = useCallback(async (clusterId: number) => {
    try {
      const cluster = clusters.find(c => c.id === clusterId);
      if (!cluster) return false;

      const response = await clusterApi.updateCluster(clusterId, {
        is_active: !cluster.is_active
      });

      if (response.data) {
        await refreshClusters();
        return true;
      }
      return false;
    } catch (error) {
      console.error("切换集群激活状态失败:", error);
      return false;
    }
  }, [clusters, refreshClusters]);

  useEffect(() => {
    // 只有在认证完成后才尝试获取集群
    if (!authLoading) {
      if (isAuthenticated) {
        fetchClusters();
      } else {
        // 未认证时清空状态
        setClusters([]);
        _setActiveClusterLocal(null);
        setIsLoading(false);
      }
    }

    // 监听storage变化，当token变化时重新获取集群
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        console.log("ClusterContext: Token changed in storage");
        if (e.newValue) {
          fetchClusters();
        } else {
          setClusters([]);
          _setActiveClusterLocal(null);
          setIsLoading(false);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isAuthenticated, authLoading, fetchClusters]);

  // WebSocket集群订阅管理
  useEffect(() => {
    if (wsConnected && currentCluster && subscribe) {
      console.log(`ClusterContext: Subscribing to cluster ${currentCluster.id}`);
      // 订阅当前集群的所有资源更新
      subscribe({ cluster_id: currentCluster.id });
    }
  }, [wsConnected, currentCluster, subscribe]);

  const value = useMemo(() => ({
    clusters,
    activeCluster,
    selectedCluster,
    setActiveCluster,
    refreshClusters,
    toggleClusterActive,
    isLoading,
    // WebSocket相关
    wsConnected,
    wsConnecting,
    wsError,
    resourceUpdates,
    reconnectWebSocket: reconnect,
    currentCluster,
  }), [
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
    reconnect,
    currentCluster,
  ]);

  return (
    <ClusterContext.Provider
      value={value}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export type { Cluster };

export function useCluster() {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
}
