"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Eye, Code, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ResourceList,
  ColumnDef,
  ActionDef,
  BaseResource,
  NameColumn,
  NamespaceColumn,
  ClusterColumn,
  AgeColumn,
  ApiResponse,
} from "@/components/ResourceList";
import { deploymentApi } from "@/lib/api";
import { canManageResources } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

// ============ 类型定义 ============

interface Deployment extends BaseResource {
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  unavailable_replicas: number;
  selector: Record<string, string>;
  strategy: string;
}

// ============ 状态判断函数 ============

type DeploymentStatus = "running" | "failed" | "updating";

function getDeploymentStatus(deployment: Deployment): DeploymentStatus {
  const { replicas, ready_replicas, available_replicas } = deployment;

  if (ready_replicas === replicas && available_replicas === replicas) {
    return "running";
  } else if (ready_replicas === 0) {
    return "failed";
  } else {
    return "updating";
  }
}

function getStatusBadgeClass(status: DeploymentStatus): string {
  switch (status) {
    case "running":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "updating":
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
}

// 分页 fetch（用于 ResourceList 无限加载）
async function fetchDeploymentsPage(
  clusterId: number,
  namespace: string | undefined,
  continueToken: string | null,
  limit: number
): Promise<ApiResponse<{ items: Deployment[]; continue_token: string | null }>> {
  const result = await deploymentApi.getDeploymentsPage(clusterId, namespace, limit, continueToken);
  if (result.data) {
    return {
      data: {
        items: result.data.items as unknown as Deployment[],
        continue_token: result.data.continue_token ?? null,
      },
    };
  }
  return { error: result.error };
}

// ============ 页面组件 ============

export default function DeploymentsPage() {
  const router = useRouter();
  const t = useTranslations("deployments");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const { user } = useAuth();
  const [yamlPreview, setYamlPreview] = useState("");
  const [isYamlOpen, setIsYamlOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

  // 查看 YAML
  const handleViewYaml = async (deployment: Deployment) => {
    try {
      await runWithFeedback(
        async () => {
          const response = await deploymentApi.getDeploymentYaml(
            deployment.cluster_id,
            deployment.namespace,
            deployment.name
          );
          if (!response.data) {
            throw new Error(response.error || t("yamlLoadErrorUnknown"));
          }

          setYamlPreview(response.data.yaml);
          setSelectedDeployment(deployment);
          setIsYamlOpen(true);
        },
        {
          loading: t("yamlLoadLoading"),
          success: t("yamlLoadSuccess"),
          error: t("yamlLoadError"),
        }
      );
    } catch (error) {
      console.error("load deployment yaml failed:", error);
    }
  };

  // 重启 Deployment
  const handleRestart = async (deployment: Deployment) => {
    try {
      await runWithFeedback(
        async () => {
          const response = await deploymentApi.restartDeployment(
            deployment.cluster_id,
            deployment.namespace,
            deployment.name
          );
          if (response.error) {
            throw new Error(response.error);
          }
        },
        {
          loading: t("restartLoading", { name: deployment.name }),
          success: t("restartSuccess", { name: deployment.name }),
          error: t("restartError"),
        }
      );
    } catch (error) {
      console.error("restart deployment failed:", error);
    }
  };

  // ============ 列定义 ============
  const columns: ColumnDef<Deployment>[] = [
    NameColumn<Deployment>(),
    NamespaceColumn<Deployment>(),
    ClusterColumn<Deployment>(),
    {
      key: "status",
      header: t("status"),
      render: (item) => {
        const status = getDeploymentStatus(item);
        const statusLabel =
          status === "running"
            ? t("statusRunning")
            : status === "failed"
            ? t("statusFailed")
            : t("statusUpdating");
        return <Badge className={getStatusBadgeClass(status)}>{statusLabel}</Badge>;
      },
    },
    {
      key: "replicas",
      header: t("replicas"),
      render: (item) => `${item.ready_replicas}/${item.replicas}`,
    },
    AgeColumn<Deployment>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<Deployment>[] = [
    {
      key: "view",
      icon: Eye,
      tooltip: t("viewDetails"),
      onClick: (item) =>
        router.push(
          `/deployments/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`
        ),
    },
    {
      key: "yaml",
      icon: Code,
      tooltip: t("viewYaml"),
      onClick: handleViewYaml,
    },
    {
      key: "restart",
      icon: RotateCcw,
      tooltip: t("restart"),
      visible: () => canManageResources(user),
      onClick: handleRestart,
    },
  ];

  return (
    <>
      <ResourceList<Deployment>
        resourceType="Deployment"
        title={t("title")}
        description={t("description")}
        icon={Activity}
        columns={columns}
        actions={actions}
        fetchPageFn={fetchDeploymentsPage}
        deleteFn={async (clusterId, namespace, name) => {
          return await deploymentApi.deleteDeployment(clusterId, namespace, name);
        }}
        batchOperations={{
          delete: canManageResources(user),
          restart: false,
          label: false,
        }}
        searchFields={["name", "namespace", "cluster_name"]}
        statusFilter={{
          field: "replicas" as keyof Deployment,
          options: [
            { value: "running", label: t("statusRunning") },
            { value: "updating", label: t("statusUpdating") },
            { value: "failed", label: t("statusFailed") },
          ],
        }}
        requireNamespace={false}
        searchPlaceholder={t("searchPlaceholder")}
        detailLink={(item) =>
          `/deployments/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`
        }
        deleteConfirm={{
          title: t("deleteTitle"),
          description: (item) =>
            t("deleteDescription", { namespace: item.namespace, name: item.name }),
        }}
      />

      {/* YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedDeployment
                ? t("yamlDialogTitle", {
                    namespace: selectedDeployment.namespace,
                    name: selectedDeployment.name,
                  })
                : t("yamlDialogFallbackTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={yamlPreview}
              readOnly
              className="font-mono text-sm min-h-[400px]"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setIsYamlOpen(false)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
