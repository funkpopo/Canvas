import { apiClient, type ApiResponse } from "./client";

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
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.page_size) queryParams.append("page_size", params.page_size.toString());
    if (params?.search) queryParams.append("search", params.search);
    if (params?.role) queryParams.append("role", params.role);
    if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    return apiClient.get<{ total: number; users: User[] }>(`/users/${query}`);
  },

  async getUser(userId: number): Promise<ApiResponse<User>> {
    return apiClient.get<User>(`/users/${userId}`);
  },

  async createUser(userData: UserCreateData): Promise<ApiResponse<User>> {
    return apiClient.post<User>("/users/", userData);
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


