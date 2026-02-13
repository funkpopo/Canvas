"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPen, Plus, Trash2, Loader2 } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";

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
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

const SYSTEM_NAMESPACES = ["default", "kube-system", "kube-public", "kube-node-lease"];

interface NamespaceInfo extends BaseResource {
  status: string;
  annotations: Record<string, string>;
}

function transformNamespace(ns: Namespace): NamespaceInfo {
  return {
    ...ns,
    id: `${ns.cluster_id}-${ns.name}`,
    namespace: "",
  };
}

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
  const t = useTranslations("namespaces");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
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
      await runWithFeedback(
        async () => {
          const result = await namespaceApi.createNamespace(activeCluster.id, {
            name: newNamespaceName.trim(),
          });

          if (!result.data) {
            throw new Error(result.error || t("createErrorUnknown"));
          }

          setIsCreateDialogOpen(false);
          setNewNamespaceName("");
          setRefreshKey((prev) => prev + 1);
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create namespace failed:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const columns: ColumnDef<NamespaceInfo>[] = [
    {
      key: "name",
      header: t("name"),
      render: (item) => (
        <div className="flex items-center space-x-2">
          <span className="font-medium">{item.name}</span>
          {SYSTEM_NAMESPACES.includes(item.name) && (
            <Badge variant="secondary" className="text-xs">
              {t("systemNamespace")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (item) => <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>,
    },
    {
      key: "cluster",
      header: t("cluster"),
      render: (item) => item.cluster_name,
    },
    {
      key: "labels",
      header: t("labels"),
      render: (item) => {
        const labelCount = Object.keys(item.labels || {}).length;
        return labelCount > 0 ? <Badge variant="outline">{t("labelsCount", { count: labelCount })}</Badge> : t("emptyValue");
      },
    },
    {
      key: "age",
      header: t("age"),
      render: (item) => item.age,
    },
  ];

  const actions: ActionDef<NamespaceInfo>[] = [
    {
      key: "delete",
      icon: Trash2,
      tooltip: t("deleteNamespace"),
      variant: "outline",
      danger: true,
      disabled: (item) => SYSTEM_NAMESPACES.includes(item.name),
      onClick: () => {},
    },
  ];

  const cardConfig: CardRenderConfig<NamespaceInfo> = {
    title: (item) => (
      <div className="flex items-center space-x-2">
        <span>{item.name}</span>
        {SYSTEM_NAMESPACES.includes(item.name) && (
          <Badge variant="secondary" className="text-xs">
            {t("systemNamespace")}
          </Badge>
        )}
      </div>
    ),
    subtitle: (item) => `${item.cluster_name} • ${item.age}`,
    status: (item) => <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>,
    content: (item) => (
      <div className="space-y-4">
        {Object.keys(item.labels || {}).length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">{t("labels")}</h4>
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
                  {t("moreLabels", { count: Object.keys(item.labels || {}).length - 3 })}
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
    ),
  };

  const createDialogButton = (
    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {t("createNamespace")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="namespace-name">{t("nameInputLabel")}</Label>
            <Input
              id="namespace-name"
              value={newNamespaceName}
              onChange={(e) => setNewNamespaceName(e.target.value)}
              placeholder={t("nameInputPlaceholder")}
            />
          </div>
          {activeCluster && (
            <div>
              <Label>{t("targetCluster")}</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm">
                {activeCluster.name} ({activeCluster.endpoint})
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleCreateNamespace} disabled={isCreating || !newNamespaceName.trim() || !activeCluster}>
              {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t("create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <ResourceList<NamespaceInfo>
      key={refreshKey}
      resourceType={t("resourceType")}
      title={t("title")}
      description={t("description")}
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
          { value: "Active", label: t("active") },
          { value: "Terminating", label: t("terminating") },
        ],
      }}
      requireNamespace={false}
      defaultViewMode="card"
      cardConfig={cardConfig}
      allowViewToggle={true}
      headerActions={createDialogButton}
      detailLink={(item) => `/namespaces/${item.name}?cluster_id=${item.cluster_id}`}
      deleteConfirm={{
        title: t("deleteNamespace"),
        description: (item) => t("deleteDescription", { name: item.name }),
        showForceOption: false,
      }}
      emptyText={t("emptyText")}
    />
  );
}

export default function NamespacesPage() {
  return <NamespacesPageContent />;
}
