// API 工具函数与统一客户端

// 默认走同源 `/api`，由 Next rewrites 代理到后端（避免 CORS / 配置缺失导致 404）
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

type ApiEnvelope<T = unknown> =
  | {
      success: true;
      data: T;
      request_id?: string;
    }
  | {
      success: false;
      error?: { message?: string; code?: string; details?: unknown };
      request_id?: string;
      status_code?: number;
    };

export class ApiClient {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  }

  private buildUrl(endpoint: string): string {
    // 确保URL拼接时不会有双斜杠
    const baseUrl = API_BASE_URL.replace(/\/$/, ""); // 移除末尾斜杠
    const cleanEndpoint = endpoint.replace(/^\//, ""); // 移除开头斜杠
    return `${baseUrl}/${cleanEndpoint}`;
  }

  private async parseJsonSafe(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    return await response.json().catch(() => null);
  }

  private unwrapEnvelope<T>(payload: unknown): { ok: true; data: T } | { ok: false; message: string } | null {
    if (!payload || typeof payload !== "object") return null;
    const maybe = payload as Partial<ApiEnvelope<T>> & Record<string, unknown>;
    if (typeof maybe.success !== "boolean") return null;

    if (maybe.success === true) {
      return { ok: true, data: (maybe as any).data as T };
    }

    const errObj = (maybe as any).error as any;
    const details = errObj && typeof errObj === "object" ? (errObj.details as any) : null;

    // FastAPI 422 validation errors: {"details": {"errors": [{loc,msg,type}, ...]}}
    const errorsArr = details && typeof details === "object" ? (details.errors as any) : null;
    if (Array.isArray(errorsArr) && errorsArr.length > 0) {
      const first = errorsArr[0] as any;
      const loc = Array.isArray(first?.loc) ? first.loc : [];
      const field = loc.length >= 2 ? String(loc[loc.length - 1]) : "body";
      const msg = typeof first?.msg === "string" ? first.msg : "Validation error";
      return { ok: false, message: `${field}: ${msg}` };
    }

    const msg =
      (errObj && typeof errObj === "object" && (errObj.message as unknown)) ||
      (maybe as any).message ||
      (maybe as any).detail ||
      "Request failed";
    return { ok: false, message: typeof msg === "string" ? msg : "Request failed" };
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const body = await this.parseJsonSafe(response);
        const unwrapped = this.unwrapEnvelope<T>(body);
        const msg =
          (unwrapped && !unwrapped.ok && unwrapped.message) ||
          (body && typeof body === "object" && (body as any).detail) ||
          `HTTP ${response.status}: ${response.statusText}`;
        return { error: msg };
      }

      const body = await this.parseJsonSafe(response);
      const unwrapped = this.unwrapEnvelope<T>(body);
      if (unwrapped && unwrapped.ok) return { data: unwrapped.data };
      return { data: body as T };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Network error" };
    }
  }

  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await this.parseJsonSafe(response);
        const unwrapped = this.unwrapEnvelope<T>(errorBody);
        const msg =
          (unwrapped && !unwrapped.ok && unwrapped.message) ||
          (errorBody && typeof errorBody === "object" && (errorBody as any).detail) ||
          `HTTP ${response.status}: ${response.statusText}`;
        return { error: msg };
      }

      const okBody = await this.parseJsonSafe(response);
      const unwrapped = this.unwrapEnvelope<T>(okBody);
      if (unwrapped && unwrapped.ok) return { data: unwrapped.data };
      return { data: okBody as T };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Network error" };
    }
  }

  async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await this.parseJsonSafe(response);
        const unwrapped = this.unwrapEnvelope<T>(errorBody);
        const msg =
          (unwrapped && !unwrapped.ok && unwrapped.message) ||
          (errorBody && typeof errorBody === "object" && (errorBody as any).detail) ||
          `HTTP ${response.status}: ${response.statusText}`;
        return { error: msg };
      }

      const okBody = await this.parseJsonSafe(response);
      const unwrapped = this.unwrapEnvelope<T>(okBody);
      if (unwrapped && unwrapped.ok) return { data: unwrapped.data };
      return { data: okBody as T };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Network error" };
    }
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method: "DELETE",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorBody = await this.parseJsonSafe(response);
        const unwrapped = this.unwrapEnvelope<T>(errorBody);
        const msg =
          (unwrapped && !unwrapped.ok && unwrapped.message) ||
          (errorBody && typeof errorBody === "object" && (errorBody as any).detail) ||
          `HTTP ${response.status}: ${response.statusText}`;
        return { error: msg };
      }

      if (response.status === 204) return { data: null as T };
      const okBody = await this.parseJsonSafe(response);
      const unwrapped = this.unwrapEnvelope<T>(okBody);
      if (unwrapped && unwrapped.ok) return { data: unwrapped.data };
      return { data: (okBody ?? (null as T)) as T };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Network error" };
    }
  }
}

export const apiClient = new ApiClient();


