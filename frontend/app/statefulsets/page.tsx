"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Server, Settings, Trash2, Loader2 } from "lucide-react";
import {
  ResourceList,
  ColumnDef,
  ActionDef,
  BaseResource,
  NameColumn,
  AgeColumn,
} from "@/components/ResourceList";
import { statefulsetApi } from "@/lib/api";
import { toast } from "sonner";

// ============ 类型定义 ============

interface StatefulSet extends BaseResource {
  replicas: number;
  ready_replicas: number;
  current_replicas: number;
  updated_replicas: number;
}

// ============ 内容组件 ============

function StatefulSetsContent() {
  const searchParams = useSearchParams();
  const clusterIdFromUrl = searchParams.get("cluster_id");

  // 扩缩容对话框状态
  const [isScaleOpen, setIsScaleOpen] = useState(false);
  const [scaleTarget, setScaleTarget] = useState<StatefulSet | null>(null);
  const [newReplicas, setNewReplicas] = useState(0);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl) : null
  );

  // 刷新回调
  const [refreshKey, setRefreshKey] = useState(0);

  // 打开扩缩容对话框
  const openScaleDialog = (sts: StatefulSet) => {
    setScaleTarget(sts);
    setNewReplicas(sts.replicas);
    setIsScaleOpen(true);
  };

  // 执行扩缩容
  const handleScale = async () => {
    if (!scaleTarget || !selectedClusterId) return;

    setIsOperationLoading(true);
    try {
      const response = await statefulsetApi.scaleStatefulSet(
        selectedClusterId,
        scaleTarget.namespace,
        scaleTarget.name,
        newReplicas
      );
      if (response.data) {
        toast.success("扩缩容成功");
        setIsScaleOpen(false);
        setScaleTarget(null);
        setRefreshKey((k) => k + 1);
      } else if (response.error) {
        toast.error("扩缩容失败: " + response.error);
      }
    } catch {
      toast.error("扩缩容失败");
    } finally {
      setIsOperationLoading(false);
    }
  };

  // ============ 列定义 ============
  const columns: ColumnDef<StatefulSet>[] = [
    NameColumn<StatefulSet>(),
    {
      key: "replicas",
      header: "副本数",
      render: (item) => (
        <Badge variant={item.ready_replicas === item.replicas ? "default" : "secondary"}>
          {item.ready_replicas}/{item.replicas}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "就绪/当前/更新",
      render: (item) =>
        `${item.ready_replicas}/${item.current_replicas}/${item.updated_replicas}`,
    },
    AgeColumn<StatefulSet>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<StatefulSet>[] = [
    {
      key: "scale",
      icon: Settings,
      tooltip: "扩缩容",
      onClick: openScaleDialog,
      disabled: () => isOperationLoading,
    },
    {
      key: "delete",
      icon: Trash2,
      tooltip: "删除",
      danger: true,
      onClick: () => {},
    },
  ];

  return (
    <>
      <ResourceList<StatefulSet>
        key={refreshKey}
        resourceType="StatefulSet"
        title="StatefulSets管理"
        description="管理有状态应用工作负载"
        icon={Server}
        columns={columns}
        actions={actions}
        fetchFn={async (clusterId, namespace) => {
          if (namespace) setSelectedNamespace(namespace);
          setSelectedClusterId(clusterId);
          const result = await statefulsetApi.getStatefulSets(clusterId, namespace!);
          return {
            data: result.data as unknown as StatefulSet[],
            error: result.error,
          };
        }}
        deleteFn={async (clusterId, namespace, name) => {
          return await statefulsetApi.deleteStatefulSet(clusterId, namespace, name);
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
        searchPlaceholder="搜索 StatefulSet..."
        deleteConfirm={{
          title: "删除 StatefulSet",
          description: (item) =>
            `确定要删除 StatefulSet "${item.name}" 吗？此操作不可撤销。`,
        }}
      />

      {/* 扩缩容对话框 */}
      <Dialog open={isScaleOpen} onOpenChange={setIsScaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整副本数</DialogTitle>
            <DialogDescription>
              修改StatefulSet {scaleTarget?.name} 的副本数量
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="replicas" className="text-right">
                副本数
              </Label>
              <Input
                id="replicas"
                type="number"
                value={newReplicas}
                onChange={(e) => setNewReplicas(parseInt(e.target.value) || 0)}
                className="col-span-3"
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScaleOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleScale}
              disabled={isOperationLoading || newReplicas < 0}
            >
              {isOperationLoading && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              确认调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============ 页面组件 ============

export default function StatefulSetsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <StatefulSetsContent />
    </Suspense>
  );
}
