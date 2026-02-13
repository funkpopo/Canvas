import { apiClient, type ApiResponse } from "./client";
import type { Pod } from "./pods";
import type { Service } from "./services";

const clusterQuery = (clusterId: number | undefined | null): string =>
  clusterId ? `?cluster_id=${clusterId}` : "";

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

  async getDeploymentsPage(
    clusterId: number,
    namespace: string | undefined,
    limit: number,
    continueToken: string | null
  ): Promise<ApiResponse<{ items: Deployment[]; continue_token: string | null }>> {
    const params = new URLSearchParams();
    params.append("cluster_id", clusterId.toString());
    if (namespace) params.append("namespace", namespace);
    params.append("limit", limit.toString());
    if (continueToken) params.append("continue_token", continueToken);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<{ items: Deployment[]; continue_token: string | null }>(`/deployments/page${query}`);
  },

  async getDeployment(clusterId: number | undefined, namespace: string, deploymentName: string): Promise<ApiResponse<DeploymentDetails>> {
    return apiClient.get<DeploymentDetails>(`/deployments/${namespace}/${deploymentName}${clusterQuery(clusterId)}`);
  },

  async getDeploymentPods(clusterId: number | undefined, namespace: string, deploymentName: string): Promise<ApiResponse<Pod[]>> {
    return apiClient.get<Pod[]>(`/deployments/${namespace}/${deploymentName}/pods${clusterQuery(clusterId)}`);
  },

  async scaleDeployment(clusterId: number | undefined, namespace: string, deploymentName: string, replicas: number): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/deployments/${namespace}/${deploymentName}/scale${clusterQuery(clusterId)}`, { replicas });
  },

  async restartDeployment(clusterId: number | undefined, namespace: string, deploymentName: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/deployments/${namespace}/${deploymentName}/restart${clusterQuery(clusterId)}`, {});
  },

  async deleteDeployment(clusterId: number | undefined, namespace: string, deploymentName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/deployments/${namespace}/${deploymentName}${clusterQuery(clusterId)}`);
  },

  async createDeployment(clusterId: number, data: { yaml_content: string }): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/deployments${clusterQuery(clusterId)}`, data);
  },

  async getDeploymentYaml(
    clusterId: number | undefined,
    namespace: string,
    deploymentName: string
  ): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/deployments/${namespace}/${deploymentName}/yaml${clusterQuery(clusterId)}`);
  },

  async updateDeploymentYaml(
    clusterId: number | undefined,
    namespace: string,
    deploymentName: string,
    yaml: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}/yaml${clusterQuery(clusterId)}`, { yaml_content: yaml });
  },

  async updateDeployment(
    clusterId: number | undefined,
    namespace: string,
    deploymentName: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}${clusterQuery(clusterId)}`, updates);
  },

  async getDeploymentServices(clusterId: number | undefined, namespace: string, deploymentName: string): Promise<ApiResponse<Service[]>> {
    return apiClient.get<Service[]>(`/deployments/${namespace}/${deploymentName}/services${clusterQuery(clusterId)}`);
  },

  async getDeploymentServiceYaml(
    clusterId: number | undefined,
    namespace: string,
    deploymentName: string,
    serviceName: string
  ): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(
      `/deployments/${namespace}/${deploymentName}/services/${serviceName}/yaml${clusterQuery(clusterId)}`
    );
  },

  async updateDeploymentServiceYaml(
    clusterId: number | undefined,
    namespace: string,
    deploymentName: string,
    serviceName: string,
    yaml: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}/yaml${clusterQuery(clusterId)}`, {
      yaml,
    });
  },

  async deleteDeploymentService(
    clusterId: number | undefined,
    namespace: string,
    deploymentName: string,
    serviceName: string
  ): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}${clusterQuery(clusterId)}`);
  },
};


