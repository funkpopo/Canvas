"use client";

import { useQuery } from "@tanstack/react-query";

import { ActivityTimeline } from "@/features/dashboard/components/activity-timeline";
import { ClusterCapacity } from "@/features/dashboard/components/cluster-capacity";
import { ClusterPulse } from "@/features/dashboard/components/cluster-pulse";
import { EventFeed } from "@/features/dashboard/components/event-feed";
import { OverviewGrid } from "@/features/dashboard/components/overview-grid";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { WorkloadTable } from "@/features/dashboard/components/workload-table";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { fetchClusterOverview, fetchWorkloads, queryKeys } from "@/lib/api";
import { useI18n } from "@/shared/i18n/i18n";

export default function DashboardPage() {
  const { t } = useI18n();
  const { data: overview } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });
  const { data: workloads } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  const readyNodes = overview?.ready_nodes ?? 0;
  const totalNodes = overview?.node_count ?? 0;
  const namespaceCount = overview?.namespace_count ?? 0;
  const totalPods = overview?.total_pods ?? 0;
  const healthyPods = overview?.healthy_pods ?? 0;
  const healthyWorkloads = workloads?.filter((w) => w.status === "Healthy").length ?? 0;
  const totalWorkloads = workloads?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline">{t("dashboard.actions.configureAlerts")}</Button>
            <Button>{t("dashboard.actions.addIntegration")}</Button>
          </div>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("dashboard.meta.nodeReadiness")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{readyNodes} / {totalNodes}</p>
              <p className="text-xs text-text-muted">{t("dashboard.meta.nodeReadiness.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("dashboard.meta.namespaces")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{namespaceCount}</p>
              <p className="text-xs text-text-muted">{t("dashboard.meta.namespaces.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("dashboard.meta.podHealth")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{healthyPods} / {totalPods}</p>
              <p className="text-xs text-text-muted">{t("dashboard.meta.podHealth.help")}</p>
            </div>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success-light" size="sm">
            {t("dashboard.badge.workloadsHealthy", { healthy: healthyWorkloads, total: totalWorkloads })}
          </Badge>
          <Badge variant="info-light" size="sm">
            {overview?.cluster_name ?? t("common.unknown")}
          </Badge>
        </div>
      </PageHeader>
      <OverviewGrid />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          <ClusterCapacity />
          <WorkloadTable />
        </div>
        <div className="flex flex-col gap-6">
          <QuickActions />
          <ClusterPulse />
          <ActivityTimeline />
        </div>
      </div>
      <EventFeed />
    </div>
  );
}



