import { apiClient, type ApiResponse } from "./client";

// ===== DaemonSet 相关类型定义 =====
export interface DaemonSet {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  up_to_date: number;
  updated: number;
  available: number;
  age: string;
  labels: Record<string, string>;
  selector: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

// ===== DaemonSet API =====
export const daemonsetApi = {
  async getDaemonSets(clusterId: number, namespace: string): Promise<ApiResponse<DaemonSet[]>> {
    return apiClient.get<DaemonSet[]>(`/daemonsets/clusters/${clusterId}/namespaces/${namespace}/daemonsets`);
  },

  async getDaemonSet(clusterId: number, namespace: string, daemonsetName: string): Promise<ApiResponse<DaemonSet>> {
    return apiClient.get<DaemonSet>(`/daemonsets/clusters/${clusterId}/namespaces/${namespace}/daemonsets/${daemonsetName}`);
  },

  async deleteDaemonSet(clusterId: number, namespace: string, daemonsetName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/daemonsets/clusters/${clusterId}/namespaces/${namespace}/daemonsets/${daemonsetName}`);
  },
};


