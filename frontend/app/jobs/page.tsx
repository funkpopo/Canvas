"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Briefcase, Plus, Play, Trash2, History, Loader2 } from "lucide-react";
import {
  ResourceList,
  ColumnDef,
  ActionDef,
  BaseResource,
  NameColumn,
  AgeColumn,
  getStatusBadgeVariant,
} from "@/components/ResourceList";
import { jobApi, Job as ApiJob } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

// ============ 类型定义 ============

interface Job extends BaseResource, Omit<ApiJob, "id"> {
  id: string;
}

// ============ 内容组件 ============

function JobsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // 从 URL 获取 cluster_id
  const clusterIdFromUrl = searchParams.get("cluster_id");

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl) : null
  );

  // 创建 Job
  const handleCreateJob = async () => {
    if (!selectedClusterId || !yamlContent.trim()) {
      toast.error("请输入YAML配置");
      return;
    }

    setIsOperationLoading(true);
    try {
      const response = await jobApi.createJob(
        selectedClusterId,
        selectedNamespace,
        yamlContent
      );
      if (response.data) {
        toast.success("Job创建成功");
        setIsCreateOpen(false);
        setYamlContent("");
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch {
      toast.error("创建Job失败");
    } finally {
      setIsOperationLoading(false);
    }
  };

  // 重启 Job
  const handleRestartJob = async (job: Job) => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.restartJob(
        job.cluster_id,
        job.namespace,
        job.name
      );
      if (response.data) {
        toast.success("Job重启成功");
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch {
      toast.error("重启Job失败");
    } finally {
      setIsOperationLoading(false);
    }
  };

  // ============ 列定义 ============
  const columns: ColumnDef<Job>[] = [
    NameColumn<Job>(),
    {
      key: "completion",
      header: "完成度",
      render: (item) => (
        <div className="flex items-center space-x-2">
          <span className="text-sm">
            {item.succeeded}/{item.completions}
          </span>
          {item.failed > 0 && (
            <Badge variant="destructive" className="text-xs">
              {item.failed}失败
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "active",
      header: "活跃Pods",
      render: (item) => item.active,
    },
    {
      key: "status",
      header: "状态",
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    AgeColumn<Job>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<Job>[] = [
    {
      key: "restart",
      icon: Play,
      tooltip: "重新运行",
      onClick: handleRestartJob,
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

  // 创建按钮和历史按钮
  const headerActions = (
    <div className="flex gap-2">
      <Link href="/jobs/history">
        <Button variant="outline">
          <History className="h-4 w-4 mr-2" />
          历史记录
        </Button>
      </Link>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            创建Job
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>创建Job</DialogTitle>
            <DialogDescription>输入Job的YAML配置来创建新的Job</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="yaml">YAML配置</Label>
              <Textarea
                id="yaml"
                placeholder="粘贴Job的YAML配置..."
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateJob} disabled={isOperationLoading}>
              {isOperationLoading && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <ResourceList<Job>
      resourceType="Job"
      title="Jobs管理"
      description="管理工作负载中的一次性任务"
      icon={Briefcase}
      columns={columns}
      actions={actions}
      fetchFn={async (clusterId, namespace) => {
        if (namespace) setSelectedNamespace(namespace);
        setSelectedClusterId(clusterId);
        const result = await jobApi.getJobs(clusterId, namespace!);
        return {
          data: result.data as unknown as Job[],
          error: result.error,
        };
      }}
      deleteFn={async (clusterId, namespace, name) => {
        return await jobApi.deleteJob(clusterId, namespace, name);
      }}
      batchOperations={{
        delete: true,
        restart: false,
        label: false,
      }}
      searchFields={["name"]}
      statusFilter={{
        field: "status",
        options: [
          { value: "succeeded", label: "成功" },
          { value: "failed", label: "失败" },
          { value: "running", label: "运行中" },
          { value: "pending", label: "等待中" },
        ],
      }}
      requireNamespace={true}
      searchPlaceholder="搜索 Job..."
      headerActions={headerActions}
      detailLink={(item) =>
        `/jobs/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`
      }
      deleteConfirm={{
        title: "删除 Job",
        description: (item) =>
          `确定要删除 Job "${item.name}" 吗？此操作不可撤销。`,
      }}
    />
  );
}

// ============ 页面组件 ============

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <JobsContent />
    </Suspense>
  );
}
