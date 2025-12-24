import { apiClient, type ApiResponse } from "./client";

// ConfigMap相关类型
export interface ConfigMap {
  id: string; // 用于前端UI的唯一标识符
  name: string;
  namespace: string;
  data: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

// ConfigMap相关 API
export const configmapApi = {
  async getConfigMaps(clusterId?: number, namespace?: string): Promise<ApiResponse<ConfigMap[]>> {
    let params = "";
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? "&" : ""}namespace=${namespace}`;
    const query = params ? `?${params}` : "";
    return apiClient.get<ConfigMap[]>(`/configmaps/${query}`);
  },

  async getConfigMap(clusterId: number, namespace: string, configmapName: string): Promise<ApiResponse<ConfigMap>> {
    return apiClient.get<ConfigMap>(`/configmaps/${namespace}/${configmapName}?cluster_id=${clusterId}`);
  },

  async createConfigMap(clusterId: number, configmapData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/configmaps?cluster_id=${clusterId}`, configmapData);
  },

  async updateConfigMap(
    clusterId: number,
    namespace: string,
    configmapName: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/configmaps/${namespace}/${configmapName}?cluster_id=${clusterId}`, updates);
  },

  async deleteConfigMap(clusterId: number, namespace: string, configmapName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/configmaps/${namespace}/${configmapName}?cluster_id=${clusterId}`);
  },

  async getConfigMapYaml(
    clusterId: number,
    namespace: string,
    configmapName: string
  ): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/configmaps/${namespace}/${configmapName}/yaml?cluster_id=${clusterId}`);
  },

  async createConfigMapYaml(clusterId: number, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/configmaps/yaml?cluster_id=${clusterId}`, { yaml_content: yamlContent });
  },

  async updateConfigMapYaml(
    clusterId: number,
    namespace: string,
    configmapName: string,
    yamlContent: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/configmaps/${namespace}/${configmapName}/yaml?cluster_id=${clusterId}`, {
      yaml_content: yamlContent,
    });
  },
};


