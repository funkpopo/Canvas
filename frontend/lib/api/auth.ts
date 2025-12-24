import { API_BASE_URL, apiClient, type ApiResponse } from "./client";

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
};

// ===== Login API =====
export const loginApi = {
  async login(username: string, password: string): Promise<ApiResponse<{ access_token: string; token_type: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
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
      return { error: error instanceof Error ? error.message : "Network error" };
    }
  },
};


