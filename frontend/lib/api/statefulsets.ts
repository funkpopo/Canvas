import { apiClient, type ApiResponse } from "./client";

// ===== StatefulSet 相关类型定义 =====
export interface StatefulSet {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  current_replicas: number;
  updated_replicas: number;
  age: string;
  labels: Record<string, string>;
  selector: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

// ===== StatefulSet API =====
export const statefulsetApi = {
  async getStatefulSets(clusterId: number, namespace?: string): Promise<ApiResponse<StatefulSet[]>> {
    const ns = namespace?.trim() || "all";
    return apiClient.get<StatefulSet[]>(`/statefulsets/clusters/${clusterId}/namespaces/${ns}/statefulsets`);
  },

  async getStatefulSet(clusterId: number, namespace: string, statefulsetName: string): Promise<ApiResponse<StatefulSet>> {
    return apiClient.get<StatefulSet>(`/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets/${statefulsetName}`);
  },

  async scaleStatefulSet(
    clusterId: number,
    namespace: string,
    statefulsetName: string,
    replicas: number
  ): Promise<ApiResponse<any>> {
    return apiClient.post<any>(
      `/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets/${statefulsetName}/scale`,
      { replicas }
    );
  },

  async deleteStatefulSet(clusterId: number, namespace: string, statefulsetName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets/${statefulsetName}`);
  },

  async createStatefulSet(clusterId: number, namespace: string, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(
      `/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets`,
      { yaml_content: yamlContent }
    );
  },
};


