import { apiClient, type ApiResponse } from "./client";

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
  async getRoles(
    clusterId: number,
    options?: { namespace?: string; limit?: number; continueToken?: string | null }
  ): Promise<ApiResponse<{ roles: Role[]; total: number; cluster_id: number; cluster_name: string; continue_token?: string | null }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (options?.namespace) params.append("namespace", options.namespace);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.continueToken) params.append("continue_token", options.continueToken);
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
  async getRoleBindings(
    clusterId: number,
    options?: { namespace?: string; limit?: number; continueToken?: string | null }
  ): Promise<ApiResponse<{ role_bindings: RoleBinding[]; total: number; cluster_id: number; cluster_name: string; continue_token?: string | null }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (options?.namespace) params.append("namespace", options.namespace);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.continueToken) params.append("continue_token", options.continueToken);
    return apiClient.get(`/rbac/role-bindings?${params.toString()}`);
  },

  async getRoleBinding(clusterId: number, namespace: string, name: string): Promise<ApiResponse<RoleBinding>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/role-bindings/${namespace}/${name}?${params.toString()}`);
  },

  async deleteRoleBinding(
    clusterId: number,
    namespace: string,
    name: string
  ): Promise<ApiResponse<{ message: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.delete(`/rbac/role-bindings/${namespace}/${name}?${params.toString()}`);
  },

  // ServiceAccounts
  async getServiceAccounts(
    clusterId: number,
    options?: { namespace?: string; limit?: number; continueToken?: string | null }
  ): Promise<ApiResponse<{ service_accounts: ServiceAccount[]; total: number; cluster_id: number; cluster_name: string; continue_token?: string | null }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (options?.namespace) params.append("namespace", options.namespace);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.continueToken) params.append("continue_token", options.continueToken);
    return apiClient.get(`/rbac/service-accounts?${params.toString()}`);
  },

  async getServiceAccount(clusterId: number, namespace: string, name: string): Promise<ApiResponse<ServiceAccount>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.get(`/rbac/service-accounts/${namespace}/${name}?${params.toString()}`);
  },

  async deleteServiceAccount(
    clusterId: number,
    namespace: string,
    name: string
  ): Promise<ApiResponse<{ message: string }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    return apiClient.delete(`/rbac/service-accounts/${namespace}/${name}?${params.toString()}`);
  },

  // ClusterRoles (只读)
  async getClusterRoles(
    clusterId: number,
    options?: { limit?: number; continueToken?: string | null }
  ): Promise<ApiResponse<{ cluster_roles: ClusterRole[]; total: number; cluster_id: number; cluster_name: string; continue_token?: string | null }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.continueToken) params.append("continue_token", options.continueToken);
    return apiClient.get(`/rbac/cluster-roles?${params.toString()}`);
  },

  // ClusterRoleBindings (只读)
  async getClusterRoleBindings(
    clusterId: number,
    options?: { limit?: number; continueToken?: string | null }
  ): Promise<ApiResponse<{ cluster_role_bindings: ClusterRoleBinding[]; total: number; cluster_id: number; cluster_name: string; continue_token?: string | null }>> {
    const params = new URLSearchParams({ cluster_id: clusterId.toString() });
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.continueToken) params.append("continue_token", options.continueToken);
    return apiClient.get(`/rbac/cluster-role-bindings?${params.toString()}`);
  },
};


