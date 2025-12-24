import type { BaseResource } from "./types";

// ============ 工具函数 ============

/** 生成资源唯一 ID */
export function generateResourceId<T extends BaseResource>(item: T): string {
  return `${item.cluster_id}-${item.namespace}-${item.name}`;
}

/** 状态 Badge 变体映射 */
export function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const statusLower = status.toLowerCase();
  if (["running", "active", "ready", "succeeded", "healthy"].includes(statusLower)) {
    return "default";
  }
  if (["pending", "updating", "progressing", "unknown"].includes(statusLower)) {
    return "secondary";
  }
  if (["failed", "error", "crashloopbackoff", "terminated", "unhealthy"].includes(statusLower)) {
    return "destructive";
  }
  return "outline";
}


