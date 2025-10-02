"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
 
import { useI18n } from "@/shared/i18n/i18n";
import {
  fetchClusterConfig,
  listClusterConfigs,
  queryKeys,
  selectActiveClusterByName,
  fetchClusterHealth,
  deleteClusterConfig,
} from "@/lib/api";
import { StatusBadge } from "@/shared/ui/status-badge";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

export default function ClustersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);

  const { data: active } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  const { data: clusters, isLoading } = useQuery({
    queryKey: queryKeys.clusterConfigsAll,
    queryFn: listClusterConfigs,
  });

  const selectMutation = useMutation({
    mutationFn: async (name: string) => selectActiveClusterByName(name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfig }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.events }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workloads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterCapacity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.metricsStatus }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => deleteClusterConfig(name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfigsAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfig }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.events }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workloads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterCapacity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.metricsStatus }),
      ]);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("clusters.eyebrow")}
        title={t("clusters.title")}
        description={t("clusters.desc")}
        actions={
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push("/clusters/manage")}>{t("clusters.actions.add")}</Button>
          </div>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("clusters.saved.title")}</CardTitle>
          <CardDescription>
            {isLoading ? t("clusters.saved.loading") : t("clusters.saved.help")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {clusters && clusters.length > 0 ? (
            clusters.map((c) => {
              const isActive = active ? c.id === active.id : false;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-text-primary">{c.name}</p>
                      {isActive && (<StatusBadge status="ready" label={t("clusters.badge.active")} size="sm" />)}
                    </div>
                    <p className="text-xs text-text-muted">
                      {c.api_server ?? (c.kubeconfig_present ? t("clusters.endpoint.kubeconfig") : t("clusters.endpoint.none"))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClusterHealthChip name={c.name} />
                    <Button
                      size="sm"
                      disabled={selectMutation.isPending}
                      onClick={async () => {
                        await selectMutation.mutateAsync(c.name);
                        router.push("/");
                      }}
                    >
                      {selectMutation.isPending ? t("clusters.btn.opening") : t("clusters.btn.open")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectMutation.isPending}
                      onClick={async () => {
                        await selectMutation.mutateAsync(c.name);
                        router.push("/clusters/manage");
                      }}
                    >
                      {t("clusters.btn.edit")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteTarget(c.name)}
                    >
                      {deleteMutation.isPending ? t("clusters.btn.deleting") : t("clusters.btn.delete")}
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-text-muted">{t("clusters.empty")}</p>
          )}
        </CardContent>
      </Card>
      {deleteTarget && (
        <DeleteClusterDialog
          name={deleteTarget}
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            if (!deleteTarget) return;
            await deleteMutation.mutateAsync(deleteTarget);
            setDeleteTarget(null);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ClusterHealthChip({ name }: { name: string }) {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: queryKeys.clusterHealth(name), queryFn: () => fetchClusterHealth(name) });
  if (!data) return null;
  const status: "healthy" | "warning" | "critical" = data.reachable
    ? (data.ready_nodes != null && data.node_count != null && data.ready_nodes === data.node_count ? "healthy" : "warning")
    : "critical";
  const label = status === "healthy" ? t("topbar.health.healthy") : status === "warning" ? t("topbar.health.degraded") : t("topbar.health.offline");
  return <StatusBadge status={status} label={label} size="sm" />;
}

// Render dialog at page bottom to avoid multiple per-row overlays
function DeleteClusterDialog({
  name,
  loading,
  onConfirm,
  onClose,
}: { name: string; loading: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <ConfirmDialog
      open={!!name}
      onOpenChange={(o) => { if (!o && !loading) onClose(); }}
      title={t("clusters.confirm.delete", { name } as any)}
      description={t("clusters.saved.help")}
      confirmText={t("actions.continue")}
      cancelText={t("actions.cancel")}
      confirmVariant="destructive"
      onConfirm={onConfirm}
      loading={loading}
      doubleConfirm
      secondTitle={t("clusters.confirm.delete", { name } as any)}
      secondDescription={t("clusters.confirm.delete2", { name } as any)}
      secondConfirmText={t("clusters.btn.delete")}
    />
  );
}
