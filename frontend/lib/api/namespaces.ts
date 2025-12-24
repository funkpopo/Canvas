import { apiClient, type ApiResponse } from "./client";

// ===== Namespace 相关类型定义 =====
export interface Namespace {
  name: string;
  status: string;
  age: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface NamespaceResources {
  pods: number;
  deployments: number;
  services: number;
  configmaps: number;
  secrets: number;
  pvcs: number;
}

// ===== Namespace API =====
export const namespaceApi = {
  async getNamespaces(clusterId?: number): Promise<ApiResponse<Namespace[]>> {
    const params = clusterId ? `?cluster_id=${clusterId}` : "";
    return apiClient.get<Namespace[]>(`/namespaces${params}`);
  },

  async getNamespace(clusterId: number, namespace: string): Promise<ApiResponse<Namespace>> {
    return apiClient.get<Namespace>(`/namespaces/${namespace}?cluster_id=${clusterId}`);
  },

  async createNamespace(
    clusterId: number,
    namespaceData: { name: string; labels?: Record<string, string> }
  ): Promise<ApiResponse<Namespace>> {
    return apiClient.post<Namespace>(`/namespaces?cluster_id=${clusterId}`, namespaceData);
  },

  async deleteNamespace(clusterId: number, namespace: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/namespaces/${namespace}?cluster_id=${clusterId}`);
  },

  async getNamespaceResources(clusterId: number, namespace: string): Promise<ApiResponse<NamespaceResources>> {
    return apiClient.get<NamespaceResources>(`/namespaces/${namespace}/resources?cluster_id=${clusterId}`);
  },

  async getNamespaceDeployments(clusterId: number, namespace: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/namespaces/${namespace}/deployments?cluster_id=${clusterId}`);
  },

  async getNamespaceServices(clusterId: number, namespace: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/namespaces/${namespace}/services?cluster_id=${clusterId}`);
  },

  async getNamespaceCrds(clusterId: number, namespace: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/namespaces/${namespace}/crds?cluster_id=${clusterId}`);
  },
};


