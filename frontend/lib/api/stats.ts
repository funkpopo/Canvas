import { apiClient, type ApiResponse } from "./client";

// 统计相关类型
export interface DashboardStats {
  total_clusters: number;
  active_clusters: number;
  total_nodes: number;
  total_namespaces: number;
  total_pods: number;
  running_pods: number;
  total_services: number;
}

// 统计相关 API
export const statsApi = {
  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return apiClient.get<DashboardStats>("/stats/dashboard");
  },
};


