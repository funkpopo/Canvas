import { apiClient, type ApiResponse } from "./client";

// 服务相关类型
export interface ServicePort {
  name?: string;
  protocol?: string;
  port: number;
  target_port?: number | string;
  node_port?: number;
}

export interface Service {
  id: string; // 用于前端UI的唯一标识符
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string;
  external_ip: string | null;
  ports: ServicePort[];
  selector: Record<string, string>;
  labels: Record<string, string>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

// 服务相关 API
export const serviceApi = {
  async getServices(clusterId?: number, namespace?: string): Promise<ApiResponse<Service[]>> {
    let params = "";
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? "&" : ""}namespace=${namespace}`;
    const query = params ? `?${params}` : "";
    return apiClient.get<Service[]>(`/services/${query}`);
  },

  async getService(clusterId: number, namespace: string, serviceName: string): Promise<ApiResponse<Service>> {
    return apiClient.get<Service>(`/services/${namespace}/${serviceName}?cluster_id=${clusterId}`);
  },

  async createService(clusterId: number, serviceData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/services?cluster_id=${clusterId}`, serviceData);
  },

  async updateService(
    clusterId: number,
    namespace: string,
    serviceName: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/services/${namespace}/${serviceName}?cluster_id=${clusterId}`, updates);
  },

  async deleteService(clusterId: number, namespace: string, serviceName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/services/${namespace}/${serviceName}?cluster_id=${clusterId}`);
  },

  async getServiceYaml(clusterId: number, namespace: string, serviceName: string): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/services/${namespace}/${serviceName}/yaml?cluster_id=${clusterId}`);
  },

  async updateServiceYaml(
    clusterId: number,
    namespace: string,
    serviceName: string,
    yaml: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/services/${namespace}/${serviceName}/yaml?cluster_id=${clusterId}`, { yaml });
  },
};


