"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, FileText, Square, Wifi, WifiOff } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { useTranslations } from "@/hooks/use-translations";
import { podApi, Pod } from "@/lib/api";
import {
  ResourceList,
  BaseResource,
  ColumnDef,
  ActionDef,
  CardRenderConfig,
  ApiResponse,
  getStatusBadgeVariant,
} from "@/components/ResourceList";
import { useState } from "react";

// Pod 资源接口 - 扩展 BaseResource
interface PodInfo extends BaseResource {
  status: string;
  node_name: string | null;
  restarts: number;
  ready_containers: string;
}

// 转换 Pod 到 PodInfo (添加 BaseResource 必需字段)
function transformPod(pod: Pod): PodInfo {
  return {
    ...pod,
    id: `${pod.cluster_id}-${pod.namespace}-${pod.name}`,
    node_name: pod.node || null,
    ready_containers: pod.ready,
  };
}

// 分页 fetch（用于 ResourceList 无限加载）
async function fetchPodsPage(
  clusterId: number,
  namespace: string | undefined,
  continueToken: string | null,
  limit: number
): Promise<ApiResponse<{ items: PodInfo[]; continue_token: string | null }>> {
  const result = await podApi.getPods(clusterId, namespace, limit, continueToken);
  if (result.data) {
    return {
      data: {
        items: result.data.items.map(transformPod),
        continue_token: result.data.continue_token ?? null,
      },
    };
  }
  return { error: result.error };
}

function PodsPageContent() {
  const t = useTranslations("pods");
  const { wsConnected, activeCluster, resourceUpdates: podUpdates } = useCluster();
  const [refreshKey, setRefreshKey] = useState(0);

  // 监听WebSocket Pod更新
  useEffect(() => {
    if (podUpdates.length > 0) {
      const latestUpdate = podUpdates[podUpdates.length - 1];
      const updateData = latestUpdate.data;
      if (updateData?.resource_type && updateData.resource_type !== "pods") {
        return;
      }

      // 检查更新是否属于当前集群
      if (activeCluster && updateData.cluster_id === activeCluster.id) {
        console.log("Pod update received:", updateData);
        // 短暂延迟后刷新数据
        setTimeout(() => {
          setRefreshKey((prev) => prev + 1);
        }, 1000);
      }
    }
  }, [podUpdates, activeCluster]);

  // 列定义
  const columns: ColumnDef<PodInfo>[] = [
    {
      key: "name",
      header: t("nameLabel"),
      render: (item) => <span className="font-medium">{item.name}</span>,
    },
    {
      key: "namespace",
      header: t("namespace"),
      render: (item) => item.namespace,
    },
    {
      key: "status",
      header: t("status"),
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: "node",
      header: t("nodeLabel"),
      render: (item) => item.node_name || t("notScheduled"),
    },
    {
      key: "containers",
      header: t("containersLabel"),
      render: (item) => item.ready_containers,
    },
    {
      key: "restarts",
      header: t("restarts"),
      render: (item) => item.restarts,
    },
    {
      key: "age",
      header: t("age"),
      render: (item) => item.age,
    },
  ];

  // 操作按钮定义
  const actions: ActionDef<PodInfo>[] = [
    {
      key: "logs",
      icon: FileText,
      tooltip: t("viewLogsInNewWindow"),
      onClick: (item) => {
        const logsUrl = `/pods/${item.namespace}/${item.name}/logs?cluster_id=${item.cluster_id}`;
        window.open(logsUrl, "_blank", "width=800,height=600");
        toast.info(t("openedLogsInNewWindow"));
      },
    },
    {
      key: "delete",
      icon: Square,
      tooltip: t("delete"),
      variant: "destructive",
      danger: true,
      onClick: () => {
        // 删除由 ResourceList 内部处理
      },
    },
  ];

  // 卡片视图配置
  const cardConfig: CardRenderConfig<PodInfo> = {
    title: (item) => item.name,
    subtitle: (item) => `${item.cluster_name} • ${item.namespace} • ${item.age}`,
    status: (item) => (
      <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
    ),
    content: (item) => (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">{t("nodeLabelWithColon")}</span>
          <span>{item.node_name || t("notScheduled")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">{t("containersLabelWithColon")}</span>
          <span>{item.ready_containers}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">{t("restartsLabelWithColon")}</span>
          <span>{item.restarts}</span>
        </div>
      </div>
    ),
  };

  // WebSocket 状态 Badge
  const statusBadge = wsConnected ? (
    <Badge variant="default" className="bg-green-500 hover:bg-green-600">
      <Wifi className="h-3 w-3 mr-1" />
      {t("realTimeConnected")}
    </Badge>
  ) : (
    <Badge variant="secondary">
      <WifiOff className="h-3 w-3 mr-1" />
      {t("realTimeDisconnected")}
    </Badge>
  );

  // 批量删除处理
  const handleBatchDelete = async (selectedPodsData: PodInfo[]) => {
    try {
      const result = await podApi.batchDeletePods(
        selectedPodsData[0]?.cluster_id,
        selectedPodsData.map((pod) => ({ namespace: pod.namespace, name: pod.name }))
      );

      if (result.data) {
        const data = result.data as { success_count: number; failure_count: number };
        if (data.failure_count > 0) {
          toast.error(t("batchDeletePartial", { success: data.success_count, failed: data.failure_count }));
        } else {
          toast.success(t("batchDeleteSuccess", { count: data.success_count }));
        }
      } else {
        toast.error(t("batchDeleteFailed"));
      }
    } catch (error) {
      console.error("批量删除Pod出错:", error);
      toast.error(t("batchDeleteError"));
      throw error;
    }
  };

  // 批量重启处理
  const handleBatchRestart = async (selectedPodsData: PodInfo[]) => {
    try {
      const result = await podApi.batchRestartPods(
        selectedPodsData[0]?.cluster_id,
        selectedPodsData.map((pod) => ({ namespace: pod.namespace, name: pod.name }))
      );

      if (result.data) {
        const data = result.data as { success_count: number; failure_count: number };
        if (data.failure_count > 0) {
          toast.error(t("batchRestartPartial", { success: data.success_count, failed: data.failure_count }));
        } else {
          toast.success(t("batchRestartSuccess", { count: data.success_count }));
        }
      } else {
        toast.error(t("batchRestartFailed"));
      }
    } catch (error) {
      console.error("批量重启Pod出错:", error);
      toast.error(t("batchRestartError"));
      throw error;
    }
  };

  return (
    <ResourceList<PodInfo>
      key={refreshKey}
      resourceType="Pod"
      title={t("title")}
      description={t("description")}
      icon={Activity}
      columns={columns}
      actions={actions}
      fetchPageFn={fetchPodsPage}
      deleteFn={(clusterId, namespace, name) => podApi.deletePod(clusterId, namespace, name)}
      batchDeleteFn={handleBatchDelete}
      batchRestartFn={handleBatchRestart}
      batchOperations={{
        delete: true,
        restart: true,
        label: false,
      }}
      searchFields={["name", "namespace", "status", "node_name"]}
      statusFilter={{
        field: "status",
        options: [
          { value: "Running", label: "Running" },
          { value: "Pending", label: "Pending" },
          { value: "Succeeded", label: "Succeeded" },
          { value: "Failed", label: "Failed" },
          { value: "CrashLoopBackOff", label: "CrashLoopBackOff" },
        ],
      }}
      requireNamespace={false}
      namespaceSource="data"
      showNamespaceInHeader={true}
      defaultViewMode="card"
      cardConfig={cardConfig}
      allowViewToggle={true}
      statusBadge={statusBadge}
      detailLink={(item) => `/pods/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`}
      deleteConfirm={{
        title: t("deleteTitle"),
        description: (item) => t("deleteDescription", { name: item.name }),
        showForceOption: true,
      }}
      emptyText={t("noPodsDescription")}
    />
  );
}

export default function PodsPage() {
  return (
    <AuthGuard>
      <PodsPageContent />
    </AuthGuard>
  );
}
