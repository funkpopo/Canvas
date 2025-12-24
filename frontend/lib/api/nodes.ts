import { apiClient, type ApiResponse } from "./client";

// ===== Node 相关类型定义 =====
export interface Node {
  name: string;
  status: string;
  roles: string[];
  age: string;
  version: string;
  internal_ip: string;
  external_ip: string;
  os_image: string;
  kernel_version: string;
  container_runtime: string;
  cpu_capacity: string;
  memory_capacity: string;
  pod_capacity: string;
  labels: Record<string, string>;
  taints: Array<{ key: string; value: string; effect: string }>;
  cluster_id: number;
  cluster_name: string;
}

// ===== Node API =====
export const nodeApi = {
  async getNodes(clusterId?: number): Promise<ApiResponse<Node[]>> {
    const params = clusterId ? `?cluster_id=${clusterId}` : "";
    return apiClient.get<Node[]>(`/nodes${params}`);
  },

  async getNode(clusterId: number, nodeName: string): Promise<ApiResponse<Node>> {
    return apiClient.get<Node>(`/nodes/${nodeName}?cluster_id=${clusterId}`);
  },
};


