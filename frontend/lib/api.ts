// API 工具函数

const API_BASE_URL = 'http://localhost:8000/api';

// Token验证相关函数
export const authApi = {
  async verifyToken(): Promise<{valid: boolean, username?: string}> {
    try {
      const response = await apiClient.post<{valid: boolean, username: string}>('/auth/verify-token', {});
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

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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

// 集群相关 API
export const clusterApi = {
  async getClusters() {
    return apiClient.get('/clusters');
  },

  async getCluster(id: number) {
    return apiClient.get(`/clusters/${id}`);
  },

  async createCluster(clusterData: Record<string, unknown>) {
    return apiClient.post('/clusters', clusterData);
  },

  async updateCluster(id: number, clusterData: Record<string, unknown>) {
    return apiClient.put(`/clusters/${id}`, clusterData);
  },

  async deleteCluster(id: number) {
    return apiClient.delete(`/clusters/${id}`);
  },

  async testConnection(id: number) {
    return apiClient.post(`/clusters/${id}/test-connection`, {});
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
    return apiClient.get<PersistentVolumeClaim[]>(`/storage/claims${query}`);
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