import { apiClient, type ApiResponse } from "./client";

// Resource Quota相关类型
export interface ResourceQuota {
  name: string;
  namespace: string;
  hard: Record<string, any>;
  used: Record<string, any>;
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export interface ResourceQuotaDetails extends ResourceQuota {
  scopes: string[];
  scope_selector: any[];
}

// Resource Quota相关 API
export const resourceQuotaApi = {
  async getResourceQuotas(clusterId?: number, namespace?: string): Promise<ApiResponse<ResourceQuota[]>> {
    let params = "";
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? "&" : ""}namespace=${namespace}`;
    const query = params ? `?${params}` : "";
    return apiClient.get<ResourceQuota[]>(`/resource-quotas/${query}`);
  },

  async getResourceQuota(clusterId: number, namespace: string, quotaName: string): Promise<ApiResponse<ResourceQuotaDetails>> {
    return apiClient.get<ResourceQuotaDetails>(`/resource-quotas/${namespace}/${quotaName}?cluster_id=${clusterId}`);
  },

  async createResourceQuota(clusterId: number, quotaData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/resource-quotas?cluster_id=${clusterId}`, quotaData);
  },

  async updateResourceQuota(
    clusterId: number,
    namespace: string,
    quotaName: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/resource-quotas/${namespace}/${quotaName}?cluster_id=${clusterId}`, updates);
  },

  async deleteResourceQuota(clusterId: number, namespace: string, quotaName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/resource-quotas/${namespace}/${quotaName}?cluster_id=${clusterId}`);
  },
};


