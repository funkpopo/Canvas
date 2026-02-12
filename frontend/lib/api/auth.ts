import { apiClient, type ApiResponse } from "./client";

// Token验证相关函数
export const authApi = {
  async verifyToken(): Promise<{
    valid: boolean;
    username?: string;
    id?: number;
    role?: string;
    email?: string | undefined;
    is_active?: boolean;
  }> {
    try {
      const response = await apiClient.post<{
        valid: boolean;
        username: string;
        id: number;
        role: string;
        email?: string;
        is_active: boolean;
      }>("auth/verify-token", {});
      if (response.data) {
        return {
          valid: response.data.valid,
          username: response.data.username,
          id: response.data.id,
          role: response.data.role,
          email: response.data.email,
          is_active: response.data.is_active,
        };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  },

  async register(data: { username: string; password: string; email?: string }): Promise<
    ApiResponse<{
      id: number;
      username: string;
      email?: string;
      role: string;
      is_active: boolean;
      created_at: string;
      updated_at?: string;
      last_login?: string;
    }>
  > {
    return apiClient.post("auth/register", data);
  },

  async refreshToken(refresh_token: string): Promise<
    ApiResponse<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>
  > {
    return apiClient.post("auth/refresh", { refresh_token });
  },

  async logout(refresh_token: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post<{ message: string }>("auth/logout", { refresh_token });
  },
};

// ===== Login API =====
export const loginApi = {
  async login(
    username: string,
    password: string
  ): Promise<
    ApiResponse<{
      access_token: string;
      token_type: string;
      refresh_token?: string;
      expires_in?: number;
    }>
  > {
    // 后端 `/api/auth/login` 使用 JSON body（LoginRequest）
    return apiClient.post("auth/login", { username, password });
  },
};
