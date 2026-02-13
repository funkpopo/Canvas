import { API_BASE_URL, apiClient, type ApiResponse } from "./client";

// ===== Pod 相关类型定义 =====
export interface Pod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  ip: string;
  node: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface PodDetails extends Pod {
  containers: Array<{
    name: string;
    image: string;
    ready: boolean;
    restart_count: number;
    state: string;
  }>;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  volumes: Array<{
    name: string;
    type: string;
  }>;
}

// ===== Pod API =====
export const podApi = {
  async getPods(
    clusterId: number,
    namespace: string | undefined,
    limit: number,
    continueToken: string | null
  ): Promise<ApiResponse<{ items: Pod[]; continue_token: string | null }>> {
    const params = new URLSearchParams();
    params.append("cluster_id", clusterId.toString());
    if (namespace) params.append("namespace", namespace);
    params.append("limit", limit.toString());
    if (continueToken) params.append("continue_token", continueToken);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<{ items: Pod[]; continue_token: string | null }>(`/pods${query}`);
  },

  async getPod(clusterId: number | undefined, namespace: string, podName: string): Promise<ApiResponse<PodDetails>> {
    const params = new URLSearchParams();
    if (clusterId) {
      params.set("cluster_id", String(clusterId));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<PodDetails>(`/pods/${namespace}/${podName}${query}`);
  },

  async deletePod(clusterId: number | undefined, namespace: string, podName: string): Promise<ApiResponse<null>> {
    const params = new URLSearchParams();
    if (clusterId) {
      params.set("cluster_id", String(clusterId));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.delete<null>(`/pods/${namespace}/${podName}${query}`);
  },

  async batchDeletePods(clusterId: number, pods: Array<{ namespace: string; name: string }>): Promise<ApiResponse<any>> {
    return apiClient.post<any>("/pods/batch-delete", { cluster_id: clusterId, pods });
  },

  async batchRestartPods(clusterId: number, pods: Array<{ namespace: string; name: string }>): Promise<ApiResponse<any>> {
    return apiClient.post<any>("/pods/batch-restart", { cluster_id: clusterId, pods });
  },

  async getPodLogs(options: {
    clusterId?: number | null;
    namespace: string;
    podName: string;
    container?: string;
    tailLines?: number;
    previous?: boolean;
  }): Promise<ApiResponse<string>> {
    try {
      const params = new URLSearchParams();
      if (options.clusterId) params.set("cluster_id", String(options.clusterId));
      if (options.container) params.set("container", options.container);
      if (options.tailLines) params.set("tail_lines", String(options.tailLines));
      if (options.previous) params.set("previous", "true");

      const token = localStorage.getItem("token");
      const query = params.toString() ? `?${params.toString()}` : "";
      const namespace = encodeURIComponent(options.namespace);
      const podName = encodeURIComponent(options.podName);
      const requestLogs = async (path: string) =>
        fetch(`${API_BASE_URL.replace(/\/$/, "")}/${path}${query}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

      let response = await requestLogs(`pods/${namespace}/${podName}/logs`);
      // 兼容历史路由：/pods/logs/{namespace}/{pod}
      if (response.status === 404) {
        const legacyResponse = await requestLogs(`pods/logs/${namespace}/${podName}`);
        if (legacyResponse.ok || legacyResponse.status !== 404) {
          response = legacyResponse;
        }
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          (errorBody &&
            typeof errorBody === "object" &&
            "error" in errorBody &&
            typeof errorBody.error === "object" &&
            errorBody.error &&
            "message" in errorBody.error &&
            typeof (errorBody.error as { message?: unknown }).message === "string" &&
            (errorBody.error as { message: string }).message) ||
          `HTTP ${response.status}: ${response.statusText}`;
        return { error: message, statusCode: response.status };
      }

      const text = await response.text();
      return { data: text };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Network error" };
    }
  },
};


