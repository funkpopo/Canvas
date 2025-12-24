import { apiClient, type ApiResponse } from "./client";

// Secret相关类型
export interface Secret {
  name: string;
  namespace: string;
  type: string;
  data_keys: string[];
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export interface SecretDetails extends Secret {
  data: Record<string, any>;
}

// Secret相关 API
export const secretApi = {
  async getSecrets(clusterId?: number, namespace?: string): Promise<ApiResponse<Secret[]>> {
    let params = "";
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? "&" : ""}namespace=${namespace}`;
    const query = params ? `?${params}` : "";
    return apiClient.get<Secret[]>(`/secrets/${query}`);
  },

  async getSecret(clusterId: number, namespace: string, secretName: string): Promise<ApiResponse<SecretDetails>> {
    return apiClient.get<SecretDetails>(`/secrets/${namespace}/${secretName}?cluster_id=${clusterId}`);
  },

  async createSecret(clusterId: number, secretData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/secrets?cluster_id=${clusterId}`, secretData);
  },

  async createSecretYaml(clusterId: number, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/secrets/yaml?cluster_id=${clusterId}`, { yaml_content: yamlContent });
  },

  async updateSecret(clusterId: number, namespace: string, secretName: string, updates: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/secrets/${namespace}/${secretName}?cluster_id=${clusterId}`, updates);
  },

  async deleteSecret(clusterId: number, namespace: string, secretName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/secrets/${namespace}/${secretName}?cluster_id=${clusterId}`);
  },

  async getSecretYaml(clusterId: number, namespace: string, secretName: string): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/secrets/${namespace}/${secretName}/yaml?cluster_id=${clusterId}`);
  },

  async updateSecretYaml(
    clusterId: number,
    namespace: string,
    secretName: string,
    yamlContent: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/secrets/${namespace}/${secretName}/yaml?cluster_id=${clusterId}`, {
      yaml_content: yamlContent,
    });
  },
};


