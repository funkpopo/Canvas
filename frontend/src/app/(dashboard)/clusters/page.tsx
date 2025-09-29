"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useI18n } from "@/shared/i18n/i18n";
import {
  fetchClusterConfig,
  listClusterConfigs,
  queryKeys,
  selectActiveClusterByName,
} from "@/lib/api";

export default function ClustersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

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
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-text-muted">{t("clusters.empty")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

