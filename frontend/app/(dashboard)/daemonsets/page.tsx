"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
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
import { Loader2, Layers, Trash2, Plus } from "lucide-react";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });
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
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";

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
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const searchParams = useSearchParams();
  const clusterIdFromUrl = searchParams.get("cluster_id");

  const [selectedNamespace, setSelectedNamespace] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl) : null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");

  const yamlTemplate = `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: my-daemonset
  namespace: ${selectedNamespace || "default"}
spec:
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-container
        image: nginx:latest
        ports:
        - containerPort: 80
`;

  const handleCreateDaemonSet = async () => {
    if (!selectedClusterId) {
      toast.error(t("selectClusterFirst"));
      return;
    }
    if (!yamlContent.trim()) {
      toast.error(t("yamlRequired"));
      return;
    }
    try {
      await runWithFeedback(
        async () => {
          const response = await daemonsetApi.createDaemonSet(
            selectedClusterId,
            selectedNamespace || "default",
            yamlContent
          );
          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }
          setIsCreateOpen(false);
          setYamlContent("");
          setRefreshKey((k) => k + 1);
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create daemonset failed:", error);
    }
  };

  const createButton = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={() => { setYamlContent(yamlTemplate); setYamlError(""); }}>
          <Plus className="w-4 h-4 mr-2" />
          {t("createDaemonSet")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <YamlEditor
          value={yamlContent}
          onChange={(value) => { setYamlContent(value); setYamlError(""); }}
          error={yamlError}
          label={t("yamlEditorLabel")}
          template={yamlTemplate}
          onApplyTemplate={() => setYamlContent(yamlTemplate)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleCreateDaemonSet} disabled={!yamlContent.trim() || !!yamlError}>
            {t("createDaemonSet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      key={refreshKey}
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
      headerActions={createButton}
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