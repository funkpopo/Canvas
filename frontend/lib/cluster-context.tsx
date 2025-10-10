"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { clusterApi } from './api';

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
  setActiveCluster: (cluster: Cluster | null) => Promise<void>;
  refreshClusters: () => Promise<void>;
  toggleClusterActive: (clusterId: number) => Promise<boolean>;
  isLoading: boolean;
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [activeCluster, _setActiveClusterLocal] = useState<Cluster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const fetchClusters = async () => {
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
        const activeClusters = response.data.filter((c: Cluster) => c.is_active);
        if (activeClusters.length > 0) {
          const serverActive = activeClusters[0];
          if (!activeCluster || activeCluster.id !== serverActive.id) {
            _setActiveClusterLocal(serverActive);
          }
        } else {
          _setActiveClusterLocal(null);
        }
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
  };

  const refreshClusters = async () => {
    setIsLoading(true);
    await fetchClusters();
  };

  // 将指定集群设为唯一激活（前后端一致）
  const setActiveCluster = async (cluster: Cluster | null) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (!cluster) {
      _setActiveClusterLocal(null);
      return;
    }

    try {
      // 先设置本地状态，避免UI闪烁
      _setActiveClusterLocal(cluster);

      await Promise.all(
        clusters.map((c) =>
          clusterApi.updateCluster(c.id, { is_active: c.id === cluster.id })
        )
      );

      await refreshClusters();
    } catch (err) {
      console.error("设置激活集群失败:", err);
      // 失败时恢复到之前的活跃集群状态
      await refreshClusters();
    }
  };

  const toggleClusterActive = async (clusterId: number) => {
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
  };

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
  }, [isAuthenticated, authLoading]);

  return (
    <ClusterContext.Provider
      value={{
        clusters,
        activeCluster,
        setActiveCluster,
        refreshClusters,
        toggleClusterActive,
        isLoading,
      }}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
}
