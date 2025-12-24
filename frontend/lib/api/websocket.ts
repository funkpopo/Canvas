import { apiClient, type ApiResponse } from "./client";

// ===== WebSocket 相关 API =====
export const websocketApi = {
  // 获取WebSocket连接统计信息
  async getWebSocketStats(): Promise<ApiResponse<any>> {
    return apiClient.get<any>("ws/stats");
  },
};


