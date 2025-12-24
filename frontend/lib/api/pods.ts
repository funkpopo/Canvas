import { apiClient, type ApiResponse } from "./client";

// ===== Pod 相关类型定义 =====
export interface Pod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  ip: string;
  node: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface PodDetails extends Pod {
  containers: Array<{
    name: string;
    image: string;
    ready: boolean;
    restart_count: number;
    state: string;
  }>;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  volumes: Array<{
    name: string;
    type: string;
  }>;
}

// ===== Pod API =====
export const podApi = {
  async getPods(
    clusterId: number,
    namespace: string | undefined,
    limit: number,
    continueToken: string | null
  ): Promise<ApiResponse<{ items: Pod[]; continue_token: string | null }>> {
    const params = new URLSearchParams();
    params.append("cluster_id", clusterId.toString());
    if (namespace) params.append("namespace", namespace);
    params.append("limit", limit.toString());
    if (continueToken) params.append("continue_token", continueToken);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<{ items: Pod[]; continue_token: string | null }>(`/pods${query}`);
  },

  async getPod(clusterId: number, namespace: string, podName: string): Promise<ApiResponse<PodDetails>> {
    return apiClient.get<PodDetails>(`/pods/${namespace}/${podName}?cluster_id=${clusterId}`);
  },

  async deletePod(clusterId: number, namespace: string, podName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/pods/${namespace}/${podName}?cluster_id=${clusterId}`);
  },

  async batchDeletePods(clusterId: number, pods: Array<{ namespace: string; name: string }>): Promise<ApiResponse<any>> {
    return apiClient.post<any>("/pods/batch-delete", { cluster_id: clusterId, pods });
  },

  async batchRestartPods(clusterId: number, pods: Array<{ namespace: string; name: string }>): Promise<ApiResponse<any>> {
    return apiClient.post<any>("/pods/batch-restart", { cluster_id: clusterId, pods });
  },
};


