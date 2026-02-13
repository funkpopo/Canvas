"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";

// ============ 类型定义 ============

type Job = ApiJob & BaseResource;

// ============ 内容组件 ============

function JobsContent() {
  const searchParams = useSearchParams();
  const tJobs = useTranslations("jobs");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();

  // 从 URL 获取 cluster_id
  const clusterIdFromUrl = searchParams.get("cluster_id");

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl) : null
  );

  // 创建 Job
  const handleCreateJob = async () => {
    if (!selectedClusterId) {
      toast.error(tJobs("selectClusterFirst"));
      return;
    }

    if (!yamlContent.trim()) {
      toast.error(tJobs("yamlRequired"));
      return;
    }

    if (!selectedNamespace) {
      toast.error(tJobs("createNamespaceRequired"));
      return;
    }

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.createJob(
            selectedClusterId,
            selectedNamespace,
            yamlContent
          );
          if (!response.data) {
            throw new Error(response.error || tJobs("createErrorUnknown"));
          }

          setIsCreateOpen(false);
          setYamlContent("");
        },
        {
          loading: tJobs("createLoading"),
          success: tJobs("createSuccess"),
          error: tJobs("createError"),
        }
      );
    } catch (error) {
      console.error("create job failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  // 重启 Job
  const handleRestartJob = async (job: Job) => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.restartJob(
            job.cluster_id,
            job.namespace,
            job.name
          );
          if (!response.data) {
            throw new Error(response.error || tJobs("restartErrorUnknown"));
          }
        },
        {
          loading: tJobs("restartLoading", { name: job.name }),
          success: tJobs("restartSuccess", { name: job.name }),
          error: tJobs("restartError"),
        }
      );
    } catch (error) {
      console.error("restart job failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  // ============ 列定义 ============
  const columns: ColumnDef<Job>[] = [
    NameColumn<Job>(),
    {
      key: "completion",
      header: tJobs("completion"),
      render: (item) => (
        <div className="flex items-center space-x-2">
          <span className="text-sm">
            {item.succeeded}/{item.completions}
          </span>
          {item.failed > 0 && (
            <Badge variant="destructive" className="text-xs">
              {tJobs("failedCount", { count: item.failed })}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "active",
      header: tJobs("activePods"),
      render: (item) => item.active,
    },
    {
      key: "status",
      header: tJobs("status"),
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
      tooltip: tJobs("restartJob"),
      onClick: handleRestartJob,
      disabled: () => isOperationLoading,
    },
    {
      key: "delete",
      icon: Trash2,
      tooltip: tCommon("delete"),
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
          {tJobs("history")}
        </Button>
      </Link>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {tJobs("createJob")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{tJobs("createJobTitle")}</DialogTitle>
            <DialogDescription>{tJobs("createJobDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="yaml">{tJobs("yamlConfig")}</Label>
              <Textarea
                id="yaml"
                placeholder={tJobs("yamlPlaceholder")}
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleCreateJob} disabled={isOperationLoading}>
              {isOperationLoading && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {tJobs("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <ResourceList<Job>
      resourceType="Job"
      title={tJobs("title")}
      description={tJobs("description")}
      icon={Briefcase}
      columns={columns}
      actions={actions}
      fetchFn={async (clusterId, namespace) => {
        setSelectedNamespace(namespace || "");
        setSelectedClusterId(clusterId);
        const result = await jobApi.getJobs(clusterId, namespace);
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
          { value: "succeeded", label: tJobs("statusSucceeded") },
          { value: "failed", label: tJobs("statusFailed") },
          { value: "running", label: tJobs("statusRunning") },
          { value: "pending", label: tJobs("statusPending") },
        ],
      }}
      requireNamespace={true}
      allowAllNamespaces={true}
      defaultNamespace=""
      searchPlaceholder={tJobs("searchPlaceholder")}
      headerActions={headerActions}
      detailLink={(item) =>
        `/jobs/${item.namespace}/${item.name}?cluster_id=${item.cluster_id}`
      }
      deleteConfirm={{
        title: tJobs("deleteTitle"),
        description: (item) =>
          tJobs("deleteDescription", { name: item.name }),
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
