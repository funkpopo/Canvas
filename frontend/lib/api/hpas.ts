import { apiClient, type ApiResponse } from "./client";

// ===== HPA 相关类型定义 =====
export interface HPA {
  name: string;
  namespace: string;
  reference: {
    kind: string;
    name: string;
  };
  target_ref: string;
  min_replicas: number;
  max_replicas: number;
  current_replicas: number;
  desired_replicas: number;
  metrics: Array<{
    type: string;
    current: string;
    target: string;
  }>;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

// ===== HPA API =====
export const hpaApi = {
  async getHPAs(clusterId: number, namespace: string): Promise<ApiResponse<HPA[]>> {
    return apiClient.get<HPA[]>(`/hpas/clusters/${clusterId}/namespaces/${namespace}/hpas`);
  },

  async getHPA(clusterId: number, namespace: string, hpaName: string): Promise<ApiResponse<HPA>> {
    return apiClient.get<HPA>(`/hpas/clusters/${clusterId}/namespaces/${namespace}/hpas/${hpaName}`);
  },

  async deleteHPA(clusterId: number, namespace: string, hpaName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/hpas/clusters/${clusterId}/namespaces/${namespace}/hpas/${hpaName}`);
  },

  async createHPA(clusterId: number, namespace: string, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(
      `/hpas/clusters/${clusterId}/namespaces/${namespace}/hpas`,
      { yaml_content: yamlContent }
    );
  },
};


