import { apiClient, type ApiResponse } from "./client";

// ===== Metrics 相关类型定义 =====
export interface ClusterHealth {
  status: string;
  message: string;
  metrics_server_installed: boolean;
  available: boolean;
}

export interface ClusterMetrics {
  cluster_id: number;
  cluster_name: string;
  cpu_usage: string;
  memory_usage: string;
  pod_count: number;
  node_count: number;
  timestamp: string;
}

export interface NodeMetrics {
  name: string;
  cpu_usage: string;
  memory_usage: string;
  cpu_percentage: number;
  memory_percentage: number;
  timestamp: string;
}

// ===== Metrics API =====
export const metricsApi = {
  async getClusterHealth(clusterId: number): Promise<ApiResponse<ClusterHealth>> {
    return apiClient.get<ClusterHealth>(`/metrics/clusters/${clusterId}/metrics/health`);
  },

  async getClusterMetrics(clusterId: number): Promise<ApiResponse<ClusterMetrics>> {
    return apiClient.get<ClusterMetrics>(`/metrics/clusters/${clusterId}/metrics`);
  },

  async getNodeMetrics(clusterId: number): Promise<ApiResponse<NodeMetrics[]>> {
    return apiClient.get<NodeMetrics[]>(`/metrics/clusters/${clusterId}/nodes/metrics`);
  },

  async installMetricsServer(
    clusterId: number,
    options?: { image?: string; insecure_tls?: boolean }
  ): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/metrics/clusters/${clusterId}/metrics-server/install`, options || {});
  },
};


