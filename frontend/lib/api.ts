// API 工具函数

const API_BASE_URL = 'http://localhost:8000/api/';

// 构建完整的API URL
const buildUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint}`.replace(/\/+/g, '/');
};

// Token验证相关函数
export const authApi = {
  async verifyToken(): Promise<{valid: boolean, username?: string}> {
    try {
      const response = await apiClient.post<{valid: boolean, username: string}>('auth/verify-token', {});
      if (response.data) {
        return { valid: response.data.valid, username: response.data.username };
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
interface Cluster {
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

  async testConnection(id: number): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`clusters/${id}/test-connection`, {});
  },
};

// 统计相关 API
export const statsApi = {
  async getDashboardStats() {
    return apiClient.get('/stats/dashboard');
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
interface Service {
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string;
  external_ip: string | null;
  ports: any[];
  selector: Record<string, any>;
  labels: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

// ConfigMap相关类型
interface ConfigMap {
  name: string;
  namespace: string;
  data: Record<string, any>;
  labels: Record<string, any>;
  annotations: Record<string, any>;
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