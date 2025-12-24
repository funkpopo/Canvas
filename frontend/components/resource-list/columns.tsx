"use client";

import { Badge } from "@/components/ui/badge";
import type { BaseResource, ColumnDef } from "./types";
import { getStatusBadgeVariant } from "./utils";

// ============ 预定义列渲染器 ============

/** 名称列 */
export function NameColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "name",
    header: "名称",
    render: (item) => <span className="font-medium">{item.name}</span>,
  };
}

/** 命名空间列 */
export function NamespaceColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "namespace",
    header: "命名空间",
    render: (item) => item.namespace,
  };
}

/** 集群列 */
export function ClusterColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "cluster",
    header: "集群",
    render: (item) => item.cluster_name,
  };
}

/** 年龄列 */
export function AgeColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "age",
    header: "年龄",
    render: (item) => item.age,
  };
}

/** 状态列 */
export function StatusColumn<T extends BaseResource & { status?: string }>(
  getStatus?: (item: T) => string
): ColumnDef<T> {
  return {
    key: "status",
    header: "状态",
    render: (item) => {
      const status = getStatus ? getStatus(item) : item.status || "Unknown";
      return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>;
    },
  };
}

/** 标签列 */
export function LabelsColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "labels",
    header: "标签",
    render: (item) => {
      const labels = item.labels || {};
      const labelCount = Object.keys(labels).length;
      if (labelCount === 0) return "-";
      return (
        <Badge variant="outline" title={JSON.stringify(labels, null, 2)}>
          {labelCount} 个标签
        </Badge>
      );
    },
  };
}


