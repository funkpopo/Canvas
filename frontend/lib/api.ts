// API 工具函数

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/';

// Token验证相关函数
export const authApi = {
  async verifyToken(): Promise<{valid: boolean, username?: string, id?: number, role?: string, email?: string | undefined, is_active?: boolean}> {
    try {
      const response = await apiClient.post<{valid: boolean, username: string, id: number, role: string, email?: string, is_active: boolean}>('auth/verify-token', {});
      if (response.data) {
        return {
          valid: response.data.valid,
          username: response.data.username,
          id: response.data.id,
          role: response.data.role,
          email: response.data.email,
          is_active: response.data.is_active
        };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  }
};

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

class ApiClient {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  private buildUrl(endpoint: string): string {
    // 确保URL拼接时不会有双斜杠
    const baseUrl = API_BASE_URL.replace(/\/$/, ''); // 移除末尾斜杠
    const cleanEndpoint = endpoint.replace(/^\//, ''); // 移除开头斜杠
    return `${baseUrl}/${cleanEndpoint}`;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.detail || `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.detail || `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.detail || `HTTP ${response.status}: ${response.statusText}` };
      }

      return { data: null as T };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }
}

export const apiClient = new ApiClient();

// 集群相关类型
export interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  is_active: boolean;
}

// 集群相关 API
export const clusterApi = {
  async getClusters(): Promise<ApiResponse<Cluster[]>> {
    return apiClient.get<Cluster[]>('clusters');
  },

  
  async getCluster(id: number): Promise<ApiResponse<Cluster>> {
    return apiClient.get<Cluster>(`clusters/${id}`);
  },

  async createCluster(clusterData: Record<string, unknown>): Promise<ApiResponse<Cluster>> {
    return apiClient.post<Cluster>('clusters', clusterData);
  },

  async updateCluster(id: number, clusterData: Record<string, unknown>): Promise<ApiResponse<Cluster>> {
    return apiClient.put<Cluster>(`clusters/${id}`, clusterData);
  },

  async deleteCluster(id: number): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`clusters/${id}`);
  },

  async testConnection(id: number): Promise<ApiResponse<unknown>> {
    return apiClient.post<unknown>(`clusters/${id}/test-connection`, {});
  },
};

// 统计相关类型
interface DashboardStats {
  total_clusters: number;
  active_clusters: number;
  total_nodes: number;
  total_namespaces: number;
  total_pods: number;
  running_pods: number;
  total_services: number;
}

// 统计相关 API
export const statsApi = {
  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return apiClient.get<DashboardStats>('/stats/dashboard');
  },
};

// 存储相关类型
interface StorageClass {
  name: string;
  provisioner: string;
  reclaim_policy: string;
  volume_binding_mode: string;
  allow_volume_expansion: boolean;
  cluster_name: string;
  cluster_id: number;
}

interface PersistentVolume {
  name: string;
  capacity: string;
  access_modes: string[];
  status: string;
  claim: string | null;
  storage_class: string | null;
  volume_mode: string;
  cluster_name: string;
  cluster_id: number;
}

interface PersistentVolumeClaim {
  name: string;
  namespace: string;
  status: string;
  volume: string | null;
  capacity: string;
  access_modes: string[];
  storage_class: string | null;
  volume_mode: string;
  cluster_name: string;
  cluster_id: number;
}

interface FileItem {
  name: string;
  type: string;
  size: number | null;
  modified_time: string | null;
  permissions: string | null;
}

// 存储相关 API
export const storageApi = {
  // 存储类
  async getStorageClasses(clusterId?: number): Promise<ApiResponse<StorageClass[]>> {
    const params = clusterId ? `?cluster_id=${clusterId}` : '';
    return apiClient.get<StorageClass[]>(`/storage/classes${params}`);
  },

  async createStorageClass(clusterId: number, scData: Record<string, unknown>): Promise<ApiResponse<StorageClass>> {
    return apiClient.post<StorageClass>(`/storage/classes?cluster_id=${clusterId}`, scData);
  },

  async deleteStorageClass(clusterId: number, scName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/storage/classes/${scName}?cluster_id=${clusterId}`);
  },

  // 持久卷
  async getPersistentVolumes(clusterId?: number): Promise<ApiResponse<PersistentVolume[]>> {
    const params = clusterId ? `?cluster_id=${clusterId}` : '';
    return apiClient.get<PersistentVolume[]>(`/storage/volumes${params}`);
  },

  async getPersistentVolume(clusterId: number, pvName: string): Promise<ApiResponse<PersistentVolume>> {
    return apiClient.get<PersistentVolume>(`/storage/volumes/${pvName}?cluster_id=${clusterId}`);
  },

  async createPersistentVolume(clusterId: number, pvData: Record<string, unknown>): Promise<ApiResponse<PersistentVolume>> {
    return apiClient.post<PersistentVolume>(`/storage/volumes?cluster_id=${clusterId}`, pvData);
  },

  async deletePersistentVolume(clusterId: number, pvName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/storage/volumes/${pvName}?cluster_id=${clusterId}`);
  },

  // PVC
  async getPersistentVolumeClaims(clusterId?: number, namespace?: string): Promise<ApiResponse<PersistentVolumeClaim[]>> {
    let params = '';
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? '&' : ''}namespace=${namespace}`;
    const query = params ? `?${params}` : '';
    return apiClient.get<PersistentVolumeClaim[]>(`/storage/claims/${query}`);
  },

  async getPersistentVolumeClaim(clusterId: number, namespace: string, pvcName: string): Promise<ApiResponse<PersistentVolumeClaim>> {
    return apiClient.get<PersistentVolumeClaim>(`/storage/claims/${namespace}/${pvcName}?cluster_id=${clusterId}`);
  },

  async createPersistentVolumeClaim(clusterId: number, pvcData: Record<string, unknown>): Promise<ApiResponse<PersistentVolumeClaim>> {
    return apiClient.post<PersistentVolumeClaim>(`/storage/claims?cluster_id=${clusterId}`, pvcData);
  },

  async deletePersistentVolumeClaim(clusterId: number, namespace: string, pvcName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/storage/claims/${namespace}/${pvcName}?cluster_id=${clusterId}`);
  },

  // 文件浏览
  async browseVolumeFiles(clusterId: number, pvName: string, path: string = "/"): Promise<ApiResponse<{files: FileItem[], current_path: string}>> {
    return apiClient.get<{files: FileItem[], current_path: string}>(`/storage/volumes/${pvName}/files?cluster_id=${clusterId}&path=${encodeURIComponent(path)}`);
  },

  async readVolumeFile(clusterId: number, pvName: string, filePath: string, maxLines?: number): Promise<ApiResponse<{content: string, file_path: string}>> {
    let url = `/storage/volumes/${pvName}/files/content?cluster_id=${clusterId}&file_path=${encodeURIComponent(filePath)}`;
    if (maxLines) url += `&max_lines=${maxLines}`;
    return apiClient.get<{content: string, file_path: string}>(url);
  },
};

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

// Secret相关类型
interface Secret {
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

interface SecretDetails extends Secret {
  data: Record<string, any>;
}


// Network Policy相关类型
interface NetworkPolicy {
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

interface NetworkPolicyDetails extends NetworkPolicy {
  ingress: any[];
  egress: any[];
}

// Resource Quota相关类型
interface ResourceQuota {
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

interface ResourceQuotaDetails extends ResourceQuota {
  scopes: string[];
  scope_selector: any[];
}

// 服务相关 API
export const serviceApi = {
  async getServices(clusterId?: number, namespace?: string): Promise<ApiResponse<Service[]>> {
    let params = '';
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? '&' : ''}namespace=${namespace}`;
    const query = params ? `?${params}` : '';
    return apiClient.get<Service[]>(`/services/${query}`);
  },

  async getService(clusterId: number, namespace: string, serviceName: string): Promise<ApiResponse<Service>> {
    return apiClient.get<Service>(`/services/${namespace}/${serviceName}?cluster_id=${clusterId}`);
  },

  async createService(clusterId: number, serviceData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/services?cluster_id=${clusterId}`, serviceData);
  },

  async updateService(clusterId: number, namespace: string, serviceName: string, updates: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/services/${namespace}/${serviceName}?cluster_id=${clusterId}`, updates);
  },

  async deleteService(clusterId: number, namespace: string, serviceName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/services/${namespace}/${serviceName}?cluster_id=${clusterId}`);
  },

  async getServiceYaml(clusterId: number, namespace: string, serviceName: string): Promise<ApiResponse<{yaml: string}>> {
    return apiClient.get<{yaml: string}>(`/services/${namespace}/${serviceName}/yaml?cluster_id=${clusterId}`);
  },

  async updateServiceYaml(clusterId: number, namespace: string, serviceName: string, yaml: string): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/services/${namespace}/${serviceName}/yaml?cluster_id=${clusterId}`, { yaml });
  },
};

// ConfigMap相关 API
export const configmapApi = {
  async getConfigMaps(clusterId?: number, namespace?: string): Promise<ApiResponse<ConfigMap[]>> {
    let params = '';
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? '&' : ''}namespace=${namespace}`;
    const query = params ? `?${params}` : '';
    return apiClient.get<ConfigMap[]>(`/configmaps/${query}`);
  },

  async getConfigMap(clusterId: number, namespace: string, configmapName: string): Promise<ApiResponse<ConfigMap>> {
    return apiClient.get<ConfigMap>(`/configmaps/${namespace}/${configmapName}?cluster_id=${clusterId}`);
  },

  async createConfigMap(clusterId: number, configmapData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/configmaps?cluster_id=${clusterId}`, configmapData);
  },

  async updateConfigMap(clusterId: number, namespace: string, configmapName: string, updates: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/configmaps/${namespace}/${configmapName}?cluster_id=${clusterId}`, updates);
  },

  async deleteConfigMap(clusterId: number, namespace: string, configmapName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/configmaps/${namespace}/${configmapName}?cluster_id=${clusterId}`);
  },

  async getConfigMapYaml(clusterId: number, namespace: string, configmapName: string): Promise<ApiResponse<{yaml: string}>> {
    return apiClient.get<{yaml: string}>(`/configmaps/${namespace}/${configmapName}/yaml?cluster_id=${clusterId}`);
  },

  async createConfigMapYaml(clusterId: number, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/configmaps/yaml?cluster_id=${clusterId}`, { yaml_content: yamlContent });
  },

  async updateConfigMapYaml(clusterId: number, namespace: string, configmapName: string, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/configmaps/${namespace}/${configmapName}/yaml?cluster_id=${clusterId}`, { yaml_content: yamlContent });
  },
};

// Secret相关 API
export const secretApi = {
  async getSecrets(clusterId?: number, namespace?: string): Promise<ApiResponse<Secret[]>> {
    let params = '';
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? '&' : ''}namespace=${namespace}`;
    const query = params ? `?${params}` : '';
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

  async getSecretYaml(clusterId: number, namespace: string, secretName: string): Promise<ApiResponse<{yaml: string}>> {
    return apiClient.get<{yaml: string}>(`/secrets/${namespace}/${secretName}/yaml?cluster_id=${clusterId}`);
  },

  async updateSecretYaml(clusterId: number, namespace: string, secretName: string, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/secrets/${namespace}/${secretName}/yaml?cluster_id=${clusterId}`, { yaml_content: yamlContent });
  },
};


// Network Policy相关 API
export const networkPolicyApi = {
  async getNetworkPolicies(clusterId?: number, namespace?: string): Promise<ApiResponse<NetworkPolicy[]>> {
    let params = '';
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? '&' : ''}namespace=${namespace}`;
    const query = params ? `?${params}` : '';
    return apiClient.get<NetworkPolicy[]>(`/network-policies/${query}`);
  },

  async getNetworkPolicy(clusterId: number, namespace: string, policyName: string): Promise<ApiResponse<NetworkPolicyDetails>> {
    return apiClient.get<NetworkPolicyDetails>(`/network-policies/${namespace}/${policyName}?cluster_id=${clusterId}`);
  },

  async createNetworkPolicy(clusterId: number, policyData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/network-policies?cluster_id=${clusterId}`, policyData);
  },

  async updateNetworkPolicy(clusterId: number, namespace: string, policyName: string, updates: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/network-policies/${namespace}/${policyName}?cluster_id=${clusterId}`, updates);
  },

  async deleteNetworkPolicy(clusterId: number, namespace: string, policyName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/network-policies/${namespace}/${policyName}?cluster_id=${clusterId}`);
  },
};

// Resource Quota相关 API
export const resourceQuotaApi = {
  async getResourceQuotas(clusterId?: number, namespace?: string): Promise<ApiResponse<ResourceQuota[]>> {
    let params = '';
    if (clusterId) params += `cluster_id=${clusterId}`;
    if (namespace) params += `${params ? '&' : ''}namespace=${namespace}`;
    const query = params ? `?${params}` : '';
    return apiClient.get<ResourceQuota[]>(`/resource-quotas/${query}`);
  },

  async getResourceQuota(clusterId: number, namespace: string, quotaName: string): Promise<ApiResponse<ResourceQuotaDetails>> {
    return apiClient.get<ResourceQuotaDetails>(`/resource-quotas/${namespace}/${quotaName}?cluster_id=${clusterId}`);
  },

  async createResourceQuota(clusterId: number, quotaData: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/resource-quotas?cluster_id=${clusterId}`, quotaData);
  },

  async updateResourceQuota(clusterId: number, namespace: string, quotaName: string, updates: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/resource-quotas/${namespace}/${quotaName}?cluster_id=${clusterId}`, updates);
  },

  async deleteResourceQuota(clusterId: number, namespace: string, quotaName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/resource-quotas/${namespace}/${quotaName}?cluster_id=${clusterId}`);
  },
};

// ===== Jobs 相关类型定义 =====

export interface Job {
  name: string;
  namespace: string;
  completions: number;
  succeeded: number;
  failed: number;
  active: number;
  age: string;
  status: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface JobDetails {
  name: string;
  namespace: string;
  completions: number;
  parallelism: number;
  backoff_limit: number;
  succeeded: number;
  failed: number;
  active: number;
  age: string;
  creation_timestamp: string;
  status: string;
  conditions: Array<{
    type: string;
    status: string;
    last_transition_time: string;
    reason: string;
    message: string;
  }>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  spec: any;
  status_detail: any;
  cluster_id: number;
  cluster_name: string;
}

export interface JobPod {
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  age: string;
  restarts: number;
  ready_containers: string;
  labels: Record<string, string>;
}

export interface JobTemplate {
  id: number;
  name: string;
  description?: string;
  category?: string;
  is_public: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface JobHistory {
  id: number;
  cluster_id: number;
  namespace: string;
  job_name: string;
  template_id?: number;
  status: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  succeeded_pods: number;
  failed_pods: number;
  total_pods: number;
  error_message?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// ===== WebSocket 相关 API =====
export const websocketApi = {
  // 获取WebSocket连接统计信息
  async getWebSocketStats(): Promise<ApiResponse<any>> {
    return apiClient.get<any>('ws/stats');
  },
};

// ===== Jobs 相关 API =====
export const jobApi = {
  // Job 管理
  async getJobs(clusterId: number, namespace: string): Promise<ApiResponse<Job[]>> {
    return apiClient.get<Job[]>(`/jobs/${clusterId}/namespaces/${namespace}/jobs`);
  },

  async getJob(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<JobDetails>> {
    return apiClient.get<JobDetails>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}`);
  },

  async createJob(clusterId: number, namespace: string, yamlContent: string, templateId?: number): Promise<ApiResponse<any>> {
    const params = templateId ? `?template_id=${templateId}` : '';
    return apiClient.post<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs${params}`, { yaml_content: yamlContent });
  },

  async deleteJob(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}`);
  },

  async restartJob(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/restart`, {});
  },

  async getJobPods(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<JobPod[]>> {
    return apiClient.get<JobPod[]>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/pods`);
  },

  async getJobYaml(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<{yaml_content: string}>> {
    return apiClient.get<{yaml_content: string}>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/yaml`);
  },

  async updateJobYaml(clusterId: number, namespace: string, jobName: string, yamlContent: string): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/yaml`, { yaml_content: yamlContent });
  },

  // Job 模板管理
  async getJobTemplates(category?: string): Promise<ApiResponse<JobTemplate[]>> {
    const params = category ? `?category=${category}` : '';
    return apiClient.get<JobTemplate[]>(`/jobs/templates${params}`);
  },

  async createJobTemplate(template: {
    name: string;
    description?: string;
    category?: string;
    yaml_content: string;
    is_public?: boolean;
  }): Promise<ApiResponse<any>> {
    return apiClient.post<any>('/jobs/templates', template);
  },

  async getJobTemplate(templateId: number): Promise<ApiResponse<any>> {
    return apiClient.get<any>(`/jobs/templates/${templateId}`);
  },

  async updateJobTemplate(templateId: number, updates: Partial<{
    name: string;
    description: string;
    category: string;
    yaml_content: string;
    is_public: boolean;
  }>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/jobs/templates/${templateId}`, updates);
  },

  async deleteJobTemplate(templateId: number): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/jobs/templates/${templateId}`);
  },

  // Job 历史记录
  async getJobHistory(clusterId?: number, namespace?: string, status?: string, startDate?: string, endDate?: string, limit?: number): Promise<ApiResponse<JobHistory[]>> {
    const params = new URLSearchParams();
    if (clusterId) params.append('cluster_id', clusterId.toString());
    if (namespace) params.append('namespace', namespace);
    if (status) params.append('status', status);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (limit) params.append('limit', limit.toString());

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<JobHistory[]>(`/jobs/history${query}`);
  },

  async updateJobHistoryStatus(historyId: number, status: string, options?: {
    succeeded_pods?: number;
    failed_pods?: number;
    error_message?: string;
  }): Promise<ApiResponse<any>> {
    const body: any = { status };
    if (options) {
      Object.assign(body, options);
    }
    return apiClient.post<any>(`/jobs/history/${historyId}/status`, body);
  },

  // 批量操作
  async bulkDeleteJobs(clusterId: number, namespace: string, jobNames: string[]): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/bulk-delete`, { job_names: jobNames });
  },

  async getJobsStatusOverview(clusterId: number, namespace: string): Promise<ApiResponse<any>> {
    return apiClient.get<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/status`);
  },

  // Job 状态监控
  async monitorJobStatus(historyId: number): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/jobs/monitor/${historyId}`, {});
  },
};

// ===== 用户管理相关类型定义 =====
export interface User {
  id: number;
  username: string;
  email?: string;
  role: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at?: string;
}

export interface UserCreateData {
  username: string;
  email?: string;
  password: string;
  role: string;
}

export interface UserUpdateData {
  email?: string;
  role?: string;
  is_active?: boolean;
  password?: string;
}

export interface PasswordChangeData {
  current_password: string;
  new_password: string;
}

// ===== 权限管理相关类型定义 =====
export interface ClusterPermission {
  id: number;
  user_id: number;
  cluster_id: number;
  permission_level: 'read' | 'manage';
  cluster_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface NamespacePermission {
  id: number;
  user_id: number;
  cluster_id: number;
  namespace: string;
  permission_level: 'read' | 'manage';
  cluster_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface UserPermissions {
  user_id: number;
  username: string;
  role: string;
  cluster_permissions: ClusterPermission[];
  namespace_permissions: NamespacePermission[];
}

export interface PermissionGrantRequest {
  permission_level: 'read' | 'manage';
}

export interface ClusterPermissionGrantRequest extends PermissionGrantRequest {
  cluster_id: number;
}

export interface NamespacePermissionGrantRequest extends PermissionGrantRequest {
  cluster_id: number;
  namespace: string;
}

// ===== 审计日志相关类型定义 =====
export interface AuditLog {
  id: number;
  user_id: number;
  username?: string;
  cluster_id: number;
  cluster_name?: string;
  action: string;
  resource_type: string;
  resource_name: string;
  details?: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface AuditStats {
  total_operations: number;
  success_count: number;
  failed_count: number;
  success_rate: number;
  action_stats: Array<{ action: string; count: number }>;
  resource_stats: Array<{ resource_type: string; count: number }>;
  user_stats: Array<{ username: string; count: number }>;
}

// ===== RBAC相关类型定义 =====
export interface Role {
  name: string;
  namespace: string;
  creation_timestamp: string;
  rules?: Array<{
    api_groups?: string[];
    resources?: string[];
    verbs?: string[];
    resource_names?: string[];
  }>;
}

export interface RoleBinding {
  name: string;
  namespace: string;
  creation_timestamp: string;
  role_ref?: {
    kind: string;
    name: string;
    api_group: string;
  };
  subjects?: Array<{
    kind: string;
    name: string;
    namespace?: string;
    api_group?: string;
  }>;
}

export interface ServiceAccount {
  name: string;
  namespace: string;
  creation_timestamp: string;
  secrets?: Array<{
    name: string;
  }>;
}

export interface ClusterRole {
  name: string;
  creation_timestamp: string;
  rules?: Array<{
    api_groups?: string[];
    resources?: string[];
    verbs?: string[];
    resource_names?: string[];
  }>;
}

export interface ClusterRoleBinding {
  name: string;
  creation_timestamp: string;
  role_ref?: {
    kind: string;
    name: string;
    api_group: string;
  };
  subjects?: Array<{
    kind: string;
    name: string;
    namespace?: string;
    api_group?: string;
  }>;
}

// ===== RBAC API =====
export const rbacApi = {
  // Roles
  async getRoles(clusterId: number, namespace?: string): Promise<ApiResponse<{ roles: Role[]; total: number; cluster_id: number; cluster_name: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (namespace) params.append('namespace', namespace);
    return apiClient.get(`/rbac/roles?${params.toString()}`);
  },

  async getRole(clusterId: number, namespace: string, name: string): Promise<ApiResponse<Role>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/roles/${namespace}/${name}?${params.toString()}`);
  },

  async deleteRole(clusterId: number, namespace: string, name: string): Promise<ApiResponse<{ message: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.delete(`/rbac/roles/${namespace}/${name}?${params.toString()}`);
  },

  // RoleBindings
  async getRoleBindings(clusterId: number, namespace?: string): Promise<ApiResponse<{ role_bindings: RoleBinding[]; total: number; cluster_id: number; cluster_name: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (namespace) params.append('namespace', namespace);
    return apiClient.get(`/rbac/role-bindings?${params.toString()}`);
  },

  async getRoleBinding(clusterId: number, namespace: string, name: string): Promise<ApiResponse<RoleBinding>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/role-bindings/${namespace}/${name}?${params.toString()}`);
  },

  async deleteRoleBinding(clusterId: number, namespace: string, name: string): Promise<ApiResponse<{ message: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.delete(`/rbac/role-bindings/${namespace}/${name}?${params.toString()}`);
  },

  // ServiceAccounts
  async getServiceAccounts(clusterId: number, namespace?: string): Promise<ApiResponse<{ service_accounts: ServiceAccount[]; total: number; cluster_id: number; cluster_name: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (namespace) params.append('namespace', namespace);
    return apiClient.get(`/rbac/service-accounts?${params.toString()}`);
  },

  async getServiceAccount(clusterId: number, namespace: string, name: string): Promise<ApiResponse<ServiceAccount>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/service-accounts/${namespace}/${name}?${params.toString()}`);
  },

  async deleteServiceAccount(clusterId: number, namespace: string, name: string): Promise<ApiResponse<{ message: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.delete(`/rbac/service-accounts/${namespace}/${name}?${params.toString()}`);
  },

  // ClusterRoles (只读)
  async getClusterRoles(clusterId: number): Promise<ApiResponse<{ cluster_roles: ClusterRole[]; total: number; cluster_id: number; cluster_name: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/cluster-roles?${params.toString()}`);
  },

  // ClusterRoleBindings (只读)
  async getClusterRoleBindings(clusterId: number): Promise<ApiResponse<{ cluster_role_bindings: ClusterRoleBinding[]; total: number; cluster_id: number; cluster_name: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/cluster-role-bindings?${params.toString()}`);
  },
};

// ===== 用户管理 API =====
export const userApi = {
  async getUsers(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    role?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<{ total: number; users: User[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.role) queryParams.append('role', params.role);
    if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
    
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return apiClient.get<{ total: number; users: User[] }>(`/users/${query}`);
  },

  async getUser(userId: number): Promise<ApiResponse<User>> {
    return apiClient.get<User>(`/users/${userId}`);
  },

  async createUser(userData: UserCreateData): Promise<ApiResponse<User>> {
    return apiClient.post<User>('/users/', userData);
  },

  async updateUser(userId: number, userData: UserUpdateData): Promise<ApiResponse<User>> {
    return apiClient.put<User>(`/users/${userId}`, userData);
  },

  async deleteUser(userId: number): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/users/${userId}`);
  },

  async changePassword(userId: number, passwordData: PasswordChangeData): Promise<ApiResponse<{ message: string }>> {
    return apiClient.put<{ message: string }>(`/users/${userId}/password`, passwordData);
  },
};

// ===== 权限管理 API =====
export const permissionApi = {
  async getUserPermissions(userId: number): Promise<ApiResponse<UserPermissions>> {
    return apiClient.get<UserPermissions>(`permissions/users/${userId}`);
  },

  async grantClusterPermission(userId: number, data: ClusterPermissionGrantRequest): Promise<ApiResponse<ClusterPermission>> {
    return apiClient.post<ClusterPermission>(`permissions/users/${userId}/clusters`, data);
  },

  async grantNamespacePermission(userId: number, data: NamespacePermissionGrantRequest): Promise<ApiResponse<NamespacePermission>> {
    return apiClient.post<NamespacePermission>(`permissions/users/${userId}/namespaces`, data);
  },

  async updateClusterPermission(permissionId: number, data: PermissionGrantRequest): Promise<ApiResponse<ClusterPermission>> {
    return apiClient.put<ClusterPermission>(`permissions/clusters/${permissionId}`, data);
  },

  async updateNamespacePermission(permissionId: number, data: PermissionGrantRequest): Promise<ApiResponse<NamespacePermission>> {
    return apiClient.put<NamespacePermission>(`permissions/namespaces/${permissionId}`, data);
  },

  async revokeClusterPermission(permissionId: number): Promise<ApiResponse<any>> {
    return apiClient.delete(`permissions/clusters/${permissionId}`);
  },

  async revokeNamespacePermission(permissionId: number): Promise<ApiResponse<any>> {
    return apiClient.delete(`permissions/namespaces/${permissionId}`);
  },
};

// ===== 审计日志 API =====
export const auditLogApi = {
  async getAuditLogs(params?: {
    page?: number;
    page_size?: number;
    user_id?: number;
    cluster_id?: number;
    action?: string;
    resource_type?: string;
    success?: boolean;
    start_date?: string;
    end_date?: string;
  }): Promise<ApiResponse<{ total: number; logs: AuditLog[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.user_id) queryParams.append('user_id', params.user_id.toString());
    if (params?.cluster_id) queryParams.append('cluster_id', params.cluster_id.toString());
    if (params?.action) queryParams.append('action', params.action);
    if (params?.resource_type) queryParams.append('resource_type', params.resource_type);
    if (params?.success !== undefined) queryParams.append('success', params.success.toString());
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return apiClient.get<{ total: number; logs: AuditLog[] }>(`/audit-logs/${query}`);
  },

  async getAuditStats(params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<ApiResponse<AuditStats>> {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return apiClient.get<AuditStats>(`/audit-logs/stats/summary${query}`);
  },
};

// ===== Namespace 相关类型定义 =====
export interface Namespace {
  name: string;
  status: string;
  age: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface NamespaceResources {
  pods: number;
  deployments: number;
  services: number;
  configmaps: number;
  secrets: number;
  pvcs: number;
}

// ===== Namespace API =====
export const namespaceApi = {
  async getNamespaces(clusterId?: number): Promise<ApiResponse<Namespace[]>> {
    const params = clusterId ? `?cluster_id=${clusterId}` : '';
    return apiClient.get<Namespace[]>(`/namespaces${params}`);
  },

  async getNamespace(clusterId: number, namespace: string): Promise<ApiResponse<Namespace>> {
    return apiClient.get<Namespace>(`/namespaces/${namespace}?cluster_id=${clusterId}`);
  },

  async createNamespace(clusterId: number, namespaceData: { name: string; labels?: Record<string, string> }): Promise<ApiResponse<Namespace>> {
    return apiClient.post<Namespace>(`/namespaces?cluster_id=${clusterId}`, namespaceData);
  },

  async deleteNamespace(clusterId: number, namespace: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/namespaces/${namespace}?cluster_id=${clusterId}`);
  },

  async getNamespaceResources(clusterId: number, namespace: string): Promise<ApiResponse<NamespaceResources>> {
    return apiClient.get<NamespaceResources>(`/namespaces/${namespace}/resources?cluster_id=${clusterId}`);
  },

  async getNamespaceDeployments(clusterId: number, namespace: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/namespaces/${namespace}/deployments?cluster_id=${clusterId}`);
  },

  async getNamespaceServices(clusterId: number, namespace: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/namespaces/${namespace}/services?cluster_id=${clusterId}`);
  },

  async getNamespaceCrds(clusterId: number, namespace: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/namespaces/${namespace}/crds?cluster_id=${clusterId}`);
  },
};

// ===== Pod 相关类型定义 =====
export interface Pod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  ip: string;
  node: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface PodDetails extends Pod {
  containers: Array<{
    name: string;
    image: string;
    ready: boolean;
    restart_count: number;
    state: string;
  }>;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  volumes: Array<{
    name: string;
    type: string;
  }>;
}

// ===== Pod API =====
export const podApi = {
  async getPods(clusterId?: number, namespace?: string): Promise<ApiResponse<Pod[]>> {
    const params = new URLSearchParams();
    if (clusterId) params.append('cluster_id', clusterId.toString());
    if (namespace) params.append('namespace', namespace);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<Pod[]>(`/pods${query}`);
  },

  async getPod(clusterId: number, namespace: string, podName: string): Promise<ApiResponse<PodDetails>> {
    return apiClient.get<PodDetails>(`/pods/${namespace}/${podName}?cluster_id=${clusterId}`);
  },

  async deletePod(clusterId: number, namespace: string, podName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/pods/${namespace}/${podName}?cluster_id=${clusterId}`);
  },

  async batchDeletePods(clusterId: number, pods: Array<{ namespace: string; name: string }>): Promise<ApiResponse<any>> {
    return apiClient.post<any>('/pods/batch-delete', { cluster_id: clusterId, pods });
  },

  async batchRestartPods(clusterId: number, pods: Array<{ namespace: string; name: string }>): Promise<ApiResponse<any>> {
    return apiClient.post<any>('/pods/batch-restart', { cluster_id: clusterId, pods });
  },
};

// ===== Node 相关类型定义 =====
export interface Node {
  name: string;
  status: string;
  roles: string[];
  age: string;
  version: string;
  internal_ip: string;
  external_ip: string;
  os_image: string;
  kernel_version: string;
  container_runtime: string;
  cpu_capacity: string;
  memory_capacity: string;
  pod_capacity: string;
  labels: Record<string, string>;
  taints: Array<{ key: string; value: string; effect: string }>;
  cluster_id: number;
  cluster_name: string;
}

// ===== Node API =====
export const nodeApi = {
  async getNodes(clusterId?: number): Promise<ApiResponse<Node[]>> {
    const params = clusterId ? `?cluster_id=${clusterId}` : '';
    return apiClient.get<Node[]>(`/nodes${params}`);
  },

  async getNode(clusterId: number, nodeName: string): Promise<ApiResponse<Node>> {
    return apiClient.get<Node>(`/nodes/${nodeName}?cluster_id=${clusterId}`);
  },
};

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
    if (clusterId) params.append('cluster_id', clusterId.toString());
    if (namespace) params.append('namespace', namespace);
    const query = params.toString() ? `?${params.toString()}` : '';
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

  async getDeploymentYaml(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/deployments/${namespace}/${deploymentName}/yaml?cluster_id=${clusterId}`);
  },

  async updateDeploymentYaml(clusterId: number, namespace: string, deploymentName: string, yaml: string): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}/yaml?cluster_id=${clusterId}`, { yaml_content: yaml });
  },

  async updateDeployment(clusterId: number, namespace: string, deploymentName: string, updates: Record<string, any>): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}?cluster_id=${clusterId}`, updates);
  },

  async getDeploymentServices(clusterId: number, namespace: string, deploymentName: string): Promise<ApiResponse<Service[]>> {
    return apiClient.get<Service[]>(`/deployments/${namespace}/${deploymentName}/services?cluster_id=${clusterId}`);
  },

  async getDeploymentServiceYaml(clusterId: number, namespace: string, deploymentName: string, serviceName: string): Promise<ApiResponse<{ yaml: string }>> {
    return apiClient.get<{ yaml: string }>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}/yaml?cluster_id=${clusterId}`);
  },

  async updateDeploymentServiceYaml(clusterId: number, namespace: string, deploymentName: string, serviceName: string, yaml: string): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}/yaml?cluster_id=${clusterId}`, { yaml });
  },

  async deleteDeploymentService(clusterId: number, namespace: string, deploymentName: string, serviceName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/deployments/${namespace}/${deploymentName}/services/${serviceName}?cluster_id=${clusterId}`);
  },
};

// ===== Event 相关类型定义 =====
export interface Event {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  source: string;
  first_timestamp: string;
  last_timestamp: string;
  count: number;
  involved_object: {
    kind: string;
    name: string;
    namespace: string;
  };
  cluster_id: number;
  cluster_name: string;
}

// ===== Event API =====
export const eventApi = {
  async getEvents(clusterId?: number, namespace?: string): Promise<ApiResponse<Event[]>> {
    const params = new URLSearchParams();
    if (clusterId) params.append('cluster_id', clusterId.toString());
    if (namespace) params.append('namespace', namespace);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<Event[]>(`/events${query}`);
  },
};

// ===== CronJob 相关类型定义 =====
export interface CronJob {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  last_schedule: string;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

// ===== CronJob API =====
export const cronjobApi = {
  async getCronJobs(clusterId: number, namespace: string): Promise<ApiResponse<CronJob[]>> {
    return apiClient.get<CronJob[]>(`/cronjobs/clusters/${clusterId}/namespaces/${namespace}/cronjobs`);
  },

  async getCronJob(clusterId: number, namespace: string, cronjobName: string): Promise<ApiResponse<CronJob>> {
    return apiClient.get<CronJob>(`/cronjobs/clusters/${clusterId}/namespaces/${namespace}/cronjobs/${cronjobName}`);
  },

  async deleteCronJob(clusterId: number, namespace: string, cronjobName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/cronjobs/clusters/${clusterId}/namespaces/${namespace}/cronjobs/${cronjobName}`);
  },
};

// ===== DaemonSet 相关类型定义 =====
export interface DaemonSet {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  up_to_date: number;
  updated: number;
  available: number;
  age: string;
  labels: Record<string, string>;
  selector: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

// ===== DaemonSet API =====
export const daemonsetApi = {
  async getDaemonSets(clusterId: number, namespace: string): Promise<ApiResponse<DaemonSet[]>> {
    return apiClient.get<DaemonSet[]>(`/daemonsets/clusters/${clusterId}/namespaces/${namespace}/daemonsets`);
  },

  async getDaemonSet(clusterId: number, namespace: string, daemonsetName: string): Promise<ApiResponse<DaemonSet>> {
    return apiClient.get<DaemonSet>(`/daemonsets/clusters/${clusterId}/namespaces/${namespace}/daemonsets/${daemonsetName}`);
  },

  async deleteDaemonSet(clusterId: number, namespace: string, daemonsetName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/daemonsets/clusters/${clusterId}/namespaces/${namespace}/daemonsets/${daemonsetName}`);
  },
};

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
  async getStatefulSets(clusterId: number, namespace: string): Promise<ApiResponse<StatefulSet[]>> {
    return apiClient.get<StatefulSet[]>(`/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets`);
  },

  async getStatefulSet(clusterId: number, namespace: string, statefulsetName: string): Promise<ApiResponse<StatefulSet>> {
    return apiClient.get<StatefulSet>(`/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets/${statefulsetName}`);
  },

  async scaleStatefulSet(clusterId: number, namespace: string, statefulsetName: string, replicas: number): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets/${statefulsetName}/scale`, { replicas });
  },

  async deleteStatefulSet(clusterId: number, namespace: string, statefulsetName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/statefulsets/clusters/${clusterId}/namespaces/${namespace}/statefulsets/${statefulsetName}`);
  },
};

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
};

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

// ===== Metrics 相关类型定义 =====
export interface ClusterHealth {
  status: string;
  message: string;
  metrics_server_installed: boolean;
  available: boolean;
}

export interface ClusterMetrics {
  cluster_id: number;
  cluster_name: string;
  cpu_usage: string;
  memory_usage: string;
  pod_count: number;
  node_count: number;
  timestamp: string;
}

export interface NodeMetrics {
  name: string;
  cpu_usage: string;
  memory_usage: string;
  cpu_percentage: number;
  memory_percentage: number;
  timestamp: string;
}

// ===== Metrics API =====
export const metricsApi = {
  async getClusterHealth(clusterId: number): Promise<ApiResponse<ClusterHealth>> {
    return apiClient.get<ClusterHealth>(`/metrics/clusters/${clusterId}/metrics/health`);
  },

  async getClusterMetrics(clusterId: number): Promise<ApiResponse<ClusterMetrics>> {
    return apiClient.get<ClusterMetrics>(`/metrics/clusters/${clusterId}/metrics`);
  },

  async getNodeMetrics(clusterId: number): Promise<ApiResponse<NodeMetrics[]>> {
    return apiClient.get<NodeMetrics[]>(`/metrics/clusters/${clusterId}/nodes/metrics`);
  },

  async installMetricsServer(clusterId: number, options?: { image?: string; insecure_tls?: boolean }): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/metrics/clusters/${clusterId}/metrics-server/install`, options || {});
  },
};

// ===== Login API =====
export const loginApi = {
  async login(username: string, password: string): Promise<ApiResponse<{ access_token: string; token_type: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username,
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.detail || `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  },
};
