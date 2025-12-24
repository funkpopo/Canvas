import { apiClient, type ApiResponse } from "./client";
import type { Pod } from "./pods";
import type { Service } from "./services";

// ===== Deployment 相关类型定义 =====
export interface Deployment {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  unavailable_replicas: number;
  age: string;
  labels: Record<string, string>;
  selector: Record<string, string>;
  strategy: string;
  cluster_id: number;
  cluster_name: string;
}

export interface DeploymentDetails extends Deployment {
  containers: Array<{
    name: string;
    image: string;
    ports: Array<{ containerPort: number; protocol: string }>;
    resources: {
      limits?: { cpu?: string; memory?: string };
      requests?: { cpu?: string; memory?: string };
    };
    env: Array<{ name: string; value?: string; valueFrom?: any }>;
  }>;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastUpdateTime?: string;
    lastTransitionTime?: string;
  }>;
}

// ===== Deployment API =====
export const deploymentApi = {
  async getDeployments(clusterId?: number, namespace?: string): Promise<ApiResponse<Deployment[]>> {
    const params = new URLSearchParams();
    if (clusterId) params.append("cluster_id", clusterId.toString());
    if (namespace) params.append("namespace", namespace);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<Deployment[]>(`/deployments${query}`);
  },

  async getDeployment(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<DeploymentDetails>> {
    return apiClient.get<DeploymentDetails>(`/deployments/${namespace}/${deploymentName}?cluster_id=${clusterId}`);
  },

  async getDeploymentPods(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<Pod[]>> {
    return apiClient.get<Pod[]>(`/deployments/${namespace}/${deploymentName}/pods?cluster_id=${clusterId}`);
  },

  async scaleDeployment(clusterId: number, namespace: string, deploymentName: string, replicas: number): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/deployments/${namespace}/${deploymentName}/scale?cluster_id=${clusterId}`, { replicas });
  },

  async restartDeployment(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/deployments/${namespace}/${deploymentName}/restart?cluster_id=${clusterId}`, {});
  },

  async deleteDeployment(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/deployments/${namespace}/${deploymentName}?cluster_id=${clusterId}`);
  },

  async getDeploymentYaml(
    clusterId: number,
    namespace: string,
    deploymentName: string
  ): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/deployments/${namespace}/${deploymentName}/yaml?cluster_id=${clusterId}`);
  },

  async updateDeploymentYaml(
    clusterId: number,
    namespace: string,
    deploymentName: string,
    yaml: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}/yaml?cluster_id=${clusterId}`, { yaml_content: yaml });
  },

  async updateDeployment(
    clusterId: number,
    namespace: string,
    deploymentName: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}?cluster_id=${clusterId}`, updates);
  },

  async getDeploymentServices(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<Service[]>> {
    return apiClient.get<Service[]>(`/deployments/${namespace}/${deploymentName}/services?cluster_id=${clusterId}`);
  },

  async getDeploymentServiceYaml(
    clusterId: number,
    namespace: string,
    deploymentName: string,
    serviceName: string
  ): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(
      `/deployments/${namespace}/${deploymentName}/services/${serviceName}/yaml?cluster_id=${clusterId}`
    );
  },

  async updateDeploymentServiceYaml(
    clusterId: number,
    namespace: string,
    deploymentName: string,
    serviceName: string,
    yaml: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}/yaml?cluster_id=${clusterId}`, {
      yaml,
    });
  },

  async deleteDeploymentService(
    clusterId: number,
    namespace: string,
    deploymentName: string,
    serviceName: string
  ): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}?cluster_id=${clusterId}`);
  },
};


