import { apiClient, type ApiResponse } from "./client";

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
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.page_size) queryParams.append("page_size", params.page_size.toString());
    if (params?.user_id) queryParams.append("user_id", params.user_id.toString());
    if (params?.cluster_id) queryParams.append("cluster_id", params.cluster_id.toString());
    if (params?.action) queryParams.append("action", params.action);
    if (params?.resource_type) queryParams.append("resource_type", params.resource_type);
    if (params?.success !== undefined) queryParams.append("success", params.success.toString());
    if (params?.start_date) queryParams.append("start_date", params.start_date);
    if (params?.end_date) queryParams.append("end_date", params.end_date);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    return apiClient.get<{ total: number; logs: AuditLog[] }>(`/audit-logs/${query}`);
  },

  async getAuditStats(params?: { start_date?: string; end_date?: string }): Promise<ApiResponse<AuditStats>> {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append("start_date", params.start_date);
    if (params?.end_date) queryParams.append("end_date", params.end_date);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    return apiClient.get<AuditStats>(`/audit-logs/stats/summary${query}`);
  },
};


