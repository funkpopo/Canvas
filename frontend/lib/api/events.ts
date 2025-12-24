import { apiClient, type ApiResponse } from "./client";

// ===== Event 相关类型定义 =====
export interface Event {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  source: string | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
  age: string;
  count: number;
  involved_object: {
    kind: string;
    name: string;
    namespace: string;
  } | null;
  cluster_id: number;
  cluster_name: string;
}

// ===== Event API =====
export const eventApi = {
  async getEvents(
    clusterId: number,
    namespace: string | undefined,
    limit: number,
    continueToken: string | null
  ): Promise<ApiResponse<{ items: Event[]; continue_token: string | null }>> {
    const params = new URLSearchParams();
    params.append("cluster_id", clusterId.toString());
    if (namespace) params.append("namespace", namespace);
    params.append("limit", limit.toString());
    if (continueToken) params.append("continue_token", continueToken);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<{ items: Event[]; continue_token: string | null }>(`/events${query}`);
  },
};


