import { apiClient, type ApiResponse } from "./client";

// Network Policy相关类型
export interface NetworkPolicy {
  name: string;
  namespace: string;
  pod_selector: Record<string, any>;
  policy_types: string[];
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export interface NetworkPolicyDetails extends NetworkPolicy {
  ingress: any[];
  egress: any[];
}

// Network Policy相关 API
export const networkPolicyApi = {
  async getNetworkPolicies(clusterId?: number, namespace?: string): Promise<ApiResponse<NetworkPolicy[]>> {
    let params = "";
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? "&" : ""}namespace=${namespace}`;
    const query = params ? `?${params}` : "";
    return apiClient.get<NetworkPolicy[]>(`/network-policies/${query}`);
  },

  async getNetworkPolicy(
    clusterId: number,
    namespace: string,
    policyName: string
  ): Promise<ApiResponse<NetworkPolicyDetails>> {
    return apiClient.get<NetworkPolicyDetails>(`/network-policies/${namespace}/${policyName}?cluster_id=${clusterId}`);
  },

  async createNetworkPolicy(clusterId: number, policyData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/network-policies?cluster_id=${clusterId}`, policyData);
  },

  async updateNetworkPolicy(
    clusterId: number,
    namespace: string,
    policyName: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/network-policies/${namespace}/${policyName}?cluster_id=${clusterId}`, updates);
  },

  async deleteNetworkPolicy(clusterId: number, namespace: string, policyName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/network-policies/${namespace}/${policyName}?cluster_id=${clusterId}`);
  },
};


