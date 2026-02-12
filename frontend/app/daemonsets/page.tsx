"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layers, Trash2 } from "lucide-react";
import {
  ResourceList,
  ColumnDef,
  ActionDef,
  BaseResource,
  NameColumn,
  AgeColumn,
} from "@/components/ResourceList";
import { daemonsetApi } from "@/lib/api";

// ============ 类型定义 ============

interface DaemonSet extends BaseResource {
  desired: number;
  current: number;
  ready: number;
  updated: number;
  available: number;
}

// ============ 内容组件 ============

function DaemonSetsContent() {
  const searchParams = useSearchParams();
  const clusterIdFromUrl = searchParams.get("cluster_id");

  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl) : null
  );

  // ============ 列定义 ============
  const columns: ColumnDef<DaemonSet>[] = [
    NameColumn<DaemonSet>(),
    {
      key: "desiredCurrent",
      header: "期望/当前",
      render: (item) => (
        <Badge variant={item.current === item.desired ? "default" : "secondary"}>
          {item.desired}/{item.current}
        </Badge>
      ),
    },
    {
      key: "ready",
      header: "就绪",
      render: (item) => item.ready,
    },
    {
      key: "updated",
      header: "更新",
      render: (item) => item.updated,
    },
    {
      key: "available",
      header: "可用",
      render: (item) => item.available,
    },
    AgeColumn<DaemonSet>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<DaemonSet>[] = [
    {
      key: "delete",
      icon: Trash2,
      tooltip: "删除",
      danger: true,
      onClick: () => {},
    },
  ];

  return (
    <ResourceList<DaemonSet>
      resourceType="DaemonSet"
      title="DaemonSets管理"
      description="管理守护进程工作负载"
      icon={Layers}
      columns={columns}
      actions={actions}
      fetchFn={async (clusterId, namespace) => {
        if (namespace) setSelectedNamespace(namespace);
        setSelectedClusterId(clusterId);
        const result = await daemonsetApi.getDaemonSets(clusterId, namespace!);
        return {
          data: result.data as unknown as DaemonSet[],
          error: result.error,
        };
      }}
      deleteFn={async (clusterId, namespace, name) => {
        return await daemonsetApi.deleteDaemonSet(clusterId, namespace, name);
      }}
      batchOperations={{
        delete: true,
        restart: false,
        label: false,
      }}
      searchFields={["name"]}
      requireNamespace={true}
      allowAllNamespaces={false}
      defaultNamespace="default"
      searchPlaceholder="搜索 DaemonSet..."
      deleteConfirm={{
        title: "删除 DaemonSet",
        description: (item) =>
          `确定要删除 DaemonSet "${item.name}" 吗？此操作不可撤销。`,
      }}
    />
  );
}

// ============ 页面组件 ============

export default function DaemonSetsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <DaemonSetsContent />
    </Suspense>
  );
}
