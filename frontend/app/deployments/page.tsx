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
import { Activity, Eye, Code, RotateCcw, Scale } from "lucide-react";
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
} from "@/components/ResourceList";
import { deploymentApi } from "@/lib/api";
import { canManageResources } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

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

function getDeploymentStatus(deployment: Deployment): string {
  const { replicas, ready_replicas, available_replicas } = deployment;

  if (ready_replicas === replicas && available_replicas === replicas) {
    return "Running";
  } else if (ready_replicas === 0) {
    return "Failed";
  } else {
    return "Updating";
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "Running":
      return "bg-green-500";
    case "Failed":
      return "bg-red-500";
    case "Updating":
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
}

// ============ 页面组件 ============

export default function DeploymentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [yamlPreview, setYamlPreview] = useState("");
  const [isYamlOpen, setIsYamlOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

  // 查看 YAML
  const handleViewYaml = async (deployment: Deployment) => {
    try {
      const response = await deploymentApi.getDeploymentYaml(
        deployment.cluster_id,
        deployment.namespace,
        deployment.name
      );
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setSelectedDeployment(deployment);
        setIsYamlOpen(true);
      } else {
        toast.error(`获取YAML失败: ${response.error}`);
      }
    } catch {
      toast.error("获取YAML失败");
    }
  };

  // 重启 Deployment
  const handleRestart = async (deployment: Deployment) => {
    try {
      const response = await deploymentApi.restartDeployment(
        deployment.cluster_id,
        deployment.namespace,
        deployment.name
      );
      if (!response.error) {
        toast.success(`Deployment ${deployment.name} 重启成功`);
      } else {
        toast.error(`重启失败: ${response.error}`);
      }
    } catch {
      toast.error("重启失败");
    }
  };

  // ============ 列定义 ============
  const columns: ColumnDef<Deployment>[] = [
    NameColumn<Deployment>(),
    NamespaceColumn<Deployment>(),
    ClusterColumn<Deployment>(),
    {
      key: "status",
      header: "状态",
      render: (item) => {
        const status = getDeploymentStatus(item);
        return <Badge className={getStatusBadgeClass(status)}>{status}</Badge>;
      },
    },
    {
      key: "replicas",
      header: "副本",
      render: (item) => `${item.ready_replicas}/${item.replicas}`,
    },
    AgeColumn<Deployment>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<Deployment>[] = [
    {
      key: "view",
      icon: Eye,
      tooltip: "查看详情",
      onClick: (item) =>
        router.push(
          `/deployments/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`
        ),
    },
    {
      key: "yaml",
      icon: Code,
      tooltip: "查看YAML",
      onClick: handleViewYaml,
    },
    {
      key: "restart",
      icon: RotateCcw,
      tooltip: "重启",
      visible: () => canManageResources(user),
      onClick: handleRestart,
    },
  ];

  return (
    <>
      <ResourceList<Deployment>
        resourceType="Deployment"
        title="Deployments"
        description="管理和监控 Kubernetes Deployments"
        icon={Activity}
        columns={columns}
        actions={actions}
        fetchFn={async (clusterId, namespace) => {
          const result = await deploymentApi.getDeployments(clusterId, namespace);
          return {
            data: result.data as unknown as Deployment[],
            error: result.error,
          };
        }}
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
            { value: "running", label: "运行中" },
            { value: "updating", label: "更新中" },
            { value: "failed", label: "失败" },
          ],
        }}
        requireNamespace={false}
        searchPlaceholder="搜索 Deployment..."
        detailLink={(item) =>
          `/deployments/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`
        }
        deleteConfirm={{
          title: "删除 Deployment",
          description: (item) =>
            `确定要删除 Deployment "${item.namespace}/${item.name}" 吗？此操作将删除所有关联的 ReplicaSets 和 Pods。`,
        }}
      />

      {/* YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedDeployment
                ? `${selectedDeployment.namespace}/${selectedDeployment.name} - YAML配置`
                : "YAML配置"}
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
            <Button onClick={() => setIsYamlOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
