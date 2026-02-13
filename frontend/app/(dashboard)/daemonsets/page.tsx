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
import { useTranslations } from "@/hooks/use-translations";

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
  const t = useTranslations("daemonsets");
  const searchParams = useSearchParams();
  const clusterIdFromUrl = searchParams.get("cluster_id");

  const [selectedNamespace, setSelectedNamespace] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl) : null
  );

  // ============ 列定义 ============
  const columns: ColumnDef<DaemonSet>[] = [
    NameColumn<DaemonSet>(),
    {
      key: "desiredCurrent",
      header: t("desiredCurrentLabel"),
      render: (item) => (
        <Badge variant={item.current === item.desired ? "default" : "secondary"}>
          {item.desired}/{item.current}
        </Badge>
      ),
    },
    {
      key: "ready",
      header: t("readyLabel"),
      render: (item) => item.ready,
    },
    {
      key: "updated",
      header: t("updatedLabel"),
      render: (item) => item.updated,
    },
    {
      key: "available",
      header: t("availableLabel"),
      render: (item) => item.available,
    },
    AgeColumn<DaemonSet>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<DaemonSet>[] = [
    {
      key: "delete",
      icon: Trash2,
      tooltip: t("deleteAction"),
      danger: true,
      onClick: () => {},
    },
  ];

  return (
    <ResourceList<DaemonSet>
      resourceType="DaemonSet"
      title={t("title")}
      description={t("description")}
      icon={Layers}
      columns={columns}
      actions={actions}
      fetchFn={async (clusterId, namespace) => {
        setSelectedNamespace(namespace || "");
        setSelectedClusterId(clusterId);
        const result = await daemonsetApi.getDaemonSets(clusterId, namespace);
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
      allowAllNamespaces={true}
      defaultNamespace=""
      searchPlaceholder={t("searchPlaceholder")}
      deleteConfirm={{
        title: t("deleteTitle"),
        description: (item) =>
          t("deleteDescription", { name: item.name }),
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
