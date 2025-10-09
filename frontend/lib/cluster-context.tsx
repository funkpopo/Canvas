"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  setActiveCluster: (cluster: Cluster | null) => void;
  refreshClusters: () => Promise<void>;
  toggleClusterActive: (clusterId: number) => Promise<boolean>;
  isLoading: boolean;
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [activeCluster, setActiveCluster] = useState<Cluster | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClusters = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch("http://localhost:8000/api/clusters", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClusters(data);

        // 如果没有活跃集群，选择第一个活跃的集群
        if (!activeCluster) {
          const activeClusters = data.filter((c: Cluster) => c.is_active);
          if (activeClusters.length > 0) {
            setActiveCluster(activeClusters[0]);
          }
        }
      }
    } catch (error) {
      console.error("获取集群列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshClusters = async () => {
    setIsLoading(true);
    await fetchClusters();
  };

  const toggleClusterActive = async (clusterId: number) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return false;

      const cluster = clusters.find(c => c.id === clusterId);
      if (!cluster) return false;

      const response = await fetch(`http://localhost:8000/api/clusters/${clusterId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: !cluster.is_active
        }),
      });

      if (response.ok) {
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
    fetchClusters();
  }, []);

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
