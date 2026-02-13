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
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

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
