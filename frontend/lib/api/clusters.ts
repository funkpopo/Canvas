import { apiClient, type ApiResponse } from "./client";

// 集群相关类型
export interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  is_active: boolean;
}

// 集群相关 API
export const clusterApi = {
  async getClusters(): Promise<ApiResponse<Cluster[]>> {
    return apiClient.get<Cluster[]>("clusters");
  },

  async getCluster(id: number): Promise<ApiResponse<Cluster>> {
    return apiClient.get<Cluster>(`clusters/${id}`);
  },

  async createCluster(clusterData: Record<string, unknown>): Promise<ApiResponse<Cluster>> {
    return apiClient.post<Cluster>("clusters", clusterData);
  },

  async updateCluster(id: number, clusterData: Record<string, unknown>): Promise<ApiResponse<Cluster>> {
    return apiClient.put<Cluster>(`clusters/${id}`, clusterData);
  },

  async deleteCluster(id: number): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`clusters/${id}`);
  },

  async testConnection(id: number): Promise<ApiResponse<unknown>> {
    return apiClient.post<unknown>(`clusters/${id}/test-connection`, {});
  },
};


