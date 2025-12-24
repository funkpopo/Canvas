import { apiClient, type ApiResponse } from "./client";

// ===== 权限管理相关类型定义 =====
export interface ClusterPermission {
  id: number;
  user_id: number;
  cluster_id: number;
  permission_level: "read" | "manage";
  cluster_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface NamespacePermission {
  id: number;
  user_id: number;
  cluster_id: number;
  namespace: string;
  permission_level: "read" | "manage";
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
  permission_level: "read" | "manage";
}

export interface ClusterPermissionGrantRequest extends PermissionGrantRequest {
  cluster_id: number;
}

export interface NamespacePermissionGrantRequest extends PermissionGrantRequest {
  cluster_id: number;
  namespace: string;
}

// ===== 权限管理 API =====
export const permissionApi = {
  async getUserPermissions(userId: number): Promise<ApiResponse<UserPermissions>> {
    return apiClient.get<UserPermissions>(`permissions/users/${userId}`);
  },

  async grantClusterPermission(userId: number, data: ClusterPermissionGrantRequest): Promise<ApiResponse<ClusterPermission>> {
    return apiClient.post<ClusterPermission>(`permissions/users/${userId}/clusters`, data);
  },

  async grantNamespacePermission(
    userId: number,
    data: NamespacePermissionGrantRequest
  ): Promise<ApiResponse<NamespacePermission>> {
    return apiClient.post<NamespacePermission>(`permissions/users/${userId}/namespaces`, data);
  },

  async updateClusterPermission(permissionId: number, data: PermissionGrantRequest): Promise<ApiResponse<ClusterPermission>> {
    return apiClient.put<ClusterPermission>(`permissions/clusters/${permissionId}`, data);
  },

  async updateNamespacePermission(
    permissionId: number,
    data: PermissionGrantRequest
  ): Promise<ApiResponse<NamespacePermission>> {
    return apiClient.put<NamespacePermission>(`permissions/namespaces/${permissionId}`, data);
  },

  async revokeClusterPermission(permissionId: number): Promise<ApiResponse<any>> {
    return apiClient.delete(`permissions/clusters/${permissionId}`);
  },

  async revokeNamespacePermission(permissionId: number): Promise<ApiResponse<any>> {
    return apiClient.delete(`permissions/namespaces/${permissionId}`);
  },
};


