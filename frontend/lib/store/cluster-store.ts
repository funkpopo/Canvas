"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clusterApi } from "@/lib/api";

export interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  is_active: boolean;
}

interface ClusterState {
  clusters: Cluster[];
  activeClusterId: number | null;
  isLoading: boolean;

  // WebSocket 相关
  wsConnected: boolean;
  wsConnecting: boolean;
  wsError: string | null;
  resourceUpdates: any[];
  reconnectWebSocket: () => void;
}

interface ClusterActions {
  refreshClusters: () => Promise<void>;
  setActiveCluster: (cluster: Cluster | null) => Promise<void>;
  toggleClusterActive: (clusterId: number) => Promise<boolean>;

  // WebSocket bridge setters
  _setWebSocketState: (s: { connected: boolean; connecting: boolean; error: string | null }) => void;
  _setResourceUpdates: (updates: any[]) => void;
  _setReconnectWebSocket: (fn: () => void) => void;
}

export const useClusterStore = create<ClusterState & ClusterActions>()(
  persist(
    (set, get) => ({
      clusters: [],
      activeClusterId: null,
      isLoading: true,

      wsConnected: false,
      wsConnecting: false,
      wsError: null,
      resourceUpdates: [],
      reconnectWebSocket: () => {},

      refreshClusters: async () => {
        const token = localStorage.getItem("token");
        if (!token) {
          set({ clusters: [], activeClusterId: null, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const response = await clusterApi.getClusters();
          const list = (response.data ?? []) as Cluster[];
          set({ clusters: list });

          const preferredId = get().activeClusterId;
          const preferredActive =
            preferredId ? list.find((c) => c.id === preferredId && c.is_active) || null : null;
          const serverActive = list.find((c) => c.is_active) || null;
          const nextActive = preferredActive || serverActive;
          set({ activeClusterId: nextActive?.id ?? null });
        } catch {
          set({ clusters: [], activeClusterId: null });
        } finally {
          set({ isLoading: false });
        }
      },

      setActiveCluster: async (cluster: Cluster | null) => {
        const token = localStorage.getItem("token");
        if (!token) return;

        if (!cluster) {
          set({ activeClusterId: null });
          return;
        }

        // 先本地切换，避免 UI 闪烁
        set({ activeClusterId: cluster.id });
        try {
          await clusterApi.activateCluster(cluster.id);
        } finally {
          await get().refreshClusters();
        }
      },

      toggleClusterActive: async (clusterId: number) => {
        try {
          const cluster = get().clusters.find((c) => c.id === clusterId);
          if (!cluster) return false;

          const response = await clusterApi.updateCluster(clusterId, { is_active: !cluster.is_active });
          if (response.data) {
            await get().refreshClusters();
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },

      _setWebSocketState: ({ connected, connecting, error }) =>
        set({ wsConnected: connected, wsConnecting: connecting, wsError: error }),
      _setResourceUpdates: (updates) => set({ resourceUpdates: updates }),
      _setReconnectWebSocket: (fn) => set({ reconnectWebSocket: fn }),
    }),
    {
      name: "canvas_cluster",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeClusterId: state.activeClusterId }),
    }
  )
);


