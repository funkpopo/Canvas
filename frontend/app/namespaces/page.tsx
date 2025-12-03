"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPen, Plus, Trash2, Loader2 } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { namespaceApi, Namespace } from "@/lib/api";
import {
  ResourceList,
  BaseResource,
  ColumnDef,
  ActionDef,
  CardRenderConfig,
  ApiResponse,
  getStatusBadgeVariant,
} from "@/components/ResourceList";

// 系统命名空间列表
const SYSTEM_NAMESPACES = ["default", "kube-system", "kube-public", "kube-node-lease"];

// Namespace 资源接口 - 扩展 BaseResource
interface NamespaceInfo extends BaseResource {
  status: string;
  annotations: Record<string, string>;
}

// 转换 Namespace 到 NamespaceInfo (添加 BaseResource 必需字段)
function transformNamespace(ns: Namespace): NamespaceInfo {
  return {
    ...ns,
    id: `${ns.cluster_id}-${ns.name}`,
    namespace: "", // 命名空间本身不属于任何命名空间
  };
}

// 自定义 fetch 函数 - 转换 API 响应
async function fetchNamespacesApi(clusterId: number): Promise<ApiResponse<NamespaceInfo[]>> {
  const result = await namespaceApi.getNamespaces(clusterId);
  if (result.data) {
    return {
      data: result.data.map(transformNamespace),
    };
  }
  return { error: result.error };
}

function NamespacesPageContent() {
  const { activeCluster } = useCluster();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNamespaceName, setNewNamespaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreateNamespace = async () => {
    if (!newNamespaceName.trim() || !activeCluster) {
      return;
    }

    setIsCreating(true);
    try {
      const result = await namespaceApi.createNamespace(activeCluster.id, {
        name: newNamespaceName.trim(),
      });

      if (result.data) {
        setIsCreateDialogOpen(false);
        setNewNamespaceName("");
        setRefreshKey((prev) => prev + 1);
        toast.success("命名空间创建成功");
      } else {
        toast.error(`创建命名空间失败: ${result.error}`);
      }
    } catch (error) {
      console.error("创建命名空间出错:", error);
      toast.error("创建命名空间时发生错误");
    } finally {
      setIsCreating(false);
    }
  };

  // 列定义
  const columns: ColumnDef<NamespaceInfo>[] = [
    {
      key: "name",
      header: "名称",
      render: (item) => (
        <div className="flex items-center space-x-2">
          <span className="font-medium">{item.name}</span>
          {SYSTEM_NAMESPACES.includes(item.name) && (
            <Badge variant="secondary" className="text-xs">
              系统
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: "cluster",
      header: "集群",
      render: (item) => item.cluster_name,
    },
    {
      key: "labels",
      header: "标签",
      render: (item) => {
        const labelCount = Object.keys(item.labels || {}).length;
        return labelCount > 0 ? (
          <Badge variant="outline">{labelCount} 个标签</Badge>
        ) : (
          "-"
        );
      },
    },
    {
      key: "age",
      header: "年龄",
      render: (item) => item.age,
    },
  ];

  // 操作按钮定义
  const actions: ActionDef<NamespaceInfo>[] = [
    {
      key: "delete",
      icon: Trash2,
      tooltip: "删除命名空间",
      variant: "outline",
      danger: true,
      disabled: (item) => SYSTEM_NAMESPACES.includes(item.name),
      onClick: () => {
        // 删除由 ResourceList 内部处理
      },
    },
  ];

  // 卡片视图配置
  const cardConfig: CardRenderConfig<NamespaceInfo> = {
    title: (item) => (
      <div className="flex items-center space-x-2">
        <span>{item.name}</span>
        {SYSTEM_NAMESPACES.includes(item.name) && (
          <Badge variant="secondary" className="text-xs">
            系统
          </Badge>
        )}
      </div>
    ),
    subtitle: (item) => `${item.cluster_name} • ${item.age}`,
    status: (item) => (
      <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
    ),
    content: (item) => (
      <div className="space-y-4">
        {/* 标签信息 */}
        {Object.keys(item.labels || {}).length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">标签</h4>
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.labels || {})
                .slice(0, 3)
                .map(([key, value]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {value}
                  </Badge>
                ))}
              {Object.keys(item.labels || {}).length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{Object.keys(item.labels || {}).length - 3} 更多
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
    ),
  };

  // 创建对话框按钮
  const createDialogButton = (
    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          创建命名空间
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建新命名空间</DialogTitle>
          <DialogDescription>在当前集群中创建新的命名空间</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="namespace-name">命名空间名称</Label>
            <Input
              id="namespace-name"
              value={newNamespaceName}
              onChange={(e) => setNewNamespaceName(e.target.value)}
              placeholder="输入命名空间名称"
            />
          </div>
          {activeCluster && (
            <div>
              <Label>目标集群</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm">
                {activeCluster.name} ({activeCluster.endpoint})
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateNamespace}
              disabled={isCreating || !newNamespaceName.trim() || !activeCluster}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              创建
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <ResourceList<NamespaceInfo>
      key={refreshKey}
      resourceType="命名空间"
      title="命名空间管理"
      description="管理Kubernetes集群中的命名空间资源"
      icon={FolderPen}
      columns={columns}
      actions={actions}
      fetchFn={fetchNamespacesApi}
      deleteFn={(clusterId, _namespace, name) => namespaceApi.deleteNamespace(clusterId, name)}
      batchOperations={{
        delete: true,
        restart: false,
        label: false,
      }}
      searchFields={["name", "status"]}
      statusFilter={{
        field: "status",
        options: [
          { value: "Active", label: "Active" },
          { value: "Terminating", label: "Terminating" },
        ],
      }}
      requireNamespace={false}
      defaultViewMode="card"
      cardConfig={cardConfig}
      allowViewToggle={true}
      headerActions={createDialogButton}
      detailLink={(item) => `/namespaces/${item.name}?cluster_id=${item.cluster_id}`}
      deleteConfirm={{
        title: "删除命名空间",
        description: (item) =>
          `确定要删除命名空间 "${item.name}" 吗？此操作不可撤销。`,
        showForceOption: false,
      }}
      emptyText="开始创建您的第一个命名空间"
    />
  );
}

export default function NamespacesPage() {
  return (
    <AuthGuard>
      <NamespacesPageContent />
    </AuthGuard>
  );
}
