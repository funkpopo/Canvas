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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Server, Settings, Trash2, Loader2, Plus } from "lucide-react";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });
import {
  ResourceList,
  ColumnDef,
  ActionDef,
  BaseResource,
  NameColumn,
  AgeColumn,
} from "@/components/ResourceList";
import { statefulsetApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";

interface StatefulSet extends BaseResource {
  replicas: number;
  ready_replicas: number;
  current_replicas: number;
  updated_replicas: number;
}

function StatefulSetsContent() {
  const t = useTranslations("statefulsets");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const searchParams = useSearchParams();
  const clusterIdFromUrl = searchParams.get("cluster_id");

  const [isScaleOpen, setIsScaleOpen] = useState(false);
  const [scaleTarget, setScaleTarget] = useState<StatefulSet | null>(null);
  const [newReplicas, setNewReplicas] = useState(0);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    clusterIdFromUrl ? parseInt(clusterIdFromUrl, 10) : null
  );

  const [refreshKey, setRefreshKey] = useState(0);

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");

  const yamlTemplate = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-statefulset
  namespace: ${selectedNamespace || "default"}
spec:
  serviceName: my-service
  replicas: 1
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

  const handleCreateStatefulSet = async () => {
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
          const response = await statefulsetApi.createStatefulSet(
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
      console.error("create statefulset failed:", error);
    }
  };

  const createButton = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={() => { setYamlContent(yamlTemplate); setYamlError(""); }}>
          <Plus className="w-4 h-4 mr-2" />
          {t("createStatefulSet")}
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
          <Button onClick={handleCreateStatefulSet} disabled={!yamlContent.trim() || !!yamlError}>
            {t("createStatefulSet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const openScaleDialog = (sts: StatefulSet) => {
    setScaleTarget(sts);
    setNewReplicas(sts.replicas);
    setIsScaleOpen(true);
  };

  const handleScale = async () => {
    if (!scaleTarget || !selectedClusterId) return;

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await statefulsetApi.scaleStatefulSet(
            selectedClusterId,
            scaleTarget.namespace,
            scaleTarget.name,
            newReplicas
          );
          if (!response.data) {
            throw new Error(response.error || t("scaleErrorUnknown"));
          }

          setIsScaleOpen(false);
          setScaleTarget(null);
          setRefreshKey((k) => k + 1);
        },
        {
          loading: t("scaleLoading", { name: scaleTarget.name }),
          success: t("scaleSuccess", { name: scaleTarget.name }),
          error: t("scaleError"),
        }
      );
    } catch (error) {
      console.error("scale statefulset failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const columns: ColumnDef<StatefulSet>[] = [
    NameColumn<StatefulSet>(),
    {
      key: "replicas",
      header: t("replicasLabel"),
      render: (item) => (
        <Badge variant={item.ready_replicas === item.replicas ? "default" : "secondary"}>
          {item.ready_replicas}/{item.replicas}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("statusSummaryLabel"),
      render: (item) => `${item.ready_replicas}/${item.current_replicas}/${item.updated_replicas}`,
    },
    AgeColumn<StatefulSet>(),
  ];

  const actions: ActionDef<StatefulSet>[] = [
    {
      key: "scale",
      icon: Settings,
      tooltip: t("scale"),
      onClick: openScaleDialog,
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

  return (
    <>
      <ResourceList<StatefulSet>
        key={refreshKey}
        resourceType="StatefulSet"
        title={t("title")}
        description={t("description")}
        icon={Server}
        columns={columns}
        actions={actions}
        fetchFn={async (clusterId, namespace) => {
          setSelectedNamespace(namespace || "");
          setSelectedClusterId(clusterId);
          const result = await statefulsetApi.getStatefulSets(clusterId, namespace);
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
        allowAllNamespaces={true}
        defaultNamespace=""
        searchPlaceholder={t("searchPlaceholder")}
        headerActions={createButton}
        deleteConfirm={{
          title: t("deleteTitle"),
          description: (item) => t("deleteDescription", { name: item.name }),
        }}
      />

      <Dialog open={isScaleOpen} onOpenChange={setIsScaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scaleDialogTitle")}</DialogTitle>
            <DialogDescription>{t("scaleDialogDescription", { name: scaleTarget?.name || "" })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="replicas" className="text-right">
                {t("replicasInputLabel")}
              </Label>
              <Input
                id="replicas"
                type="number"
                value={newReplicas}
                onChange={(e) => setNewReplicas(parseInt(e.target.value, 10) || 0)}
                className="col-span-3"
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScaleOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleScale} disabled={isOperationLoading || newReplicas < 0}>
              {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("scaleConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
