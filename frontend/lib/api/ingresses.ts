import { apiClient, type ApiResponse } from "./client";

// ===== Ingress 相关类型定义 =====
export interface Ingress {
  name: string;
  namespace: string;
  class: string;
  hosts: string[];
  address: string;
  addresses: string[];
  ports: string;
  age: string;
  labels: Record<string, string>;
  rules: Array<{
    host: string;
    paths: Array<{
      path: string;
      pathType: string;
      backend: {
        service: {
          name: string;
          port: { number: number } | { name: string };
        };
      };
    }>;
  }>;
  cluster_id: number;
  cluster_name: string;
}

// ===== Ingress API =====
export const ingressApi = {
  async getIngresses(clusterId: number, namespace: string): Promise<ApiResponse<Ingress[]>> {
    return apiClient.get<Ingress[]>(`/ingresses/clusters/${clusterId}/namespaces/${namespace}/ingresses`);
  },

  async getIngress(clusterId: number, namespace: string, ingressName: string): Promise<ApiResponse<Ingress>> {
    return apiClient.get<Ingress>(`/ingresses/clusters/${clusterId}/namespaces/${namespace}/ingresses/${ingressName}`);
  },

  async deleteIngress(clusterId: number, namespace: string, ingressName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/ingresses/clusters/${clusterId}/namespaces/${namespace}/ingresses/${ingressName}`);
  },
};


