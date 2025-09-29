import { useQuery } from "@tanstack/react-query";

import { queryKeys, fetchClusterOverview } from "@/lib/api";
import { ResourceCard } from "@/shared/ui/resource-card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";

export function OverviewGrid() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });

  const totalPods = data?.total_pods ?? 0;
  const healthyPods = data?.healthy_pods ?? 0;
  const pendingPods = data?.pending_pods ?? 0;
  const failingPods = data?.failing_pods ?? 0;
  const readyNodes = data?.ready_nodes ?? 0;
  const totalNodes = data?.node_count ?? 0;

  const podHealthPercent = totalPods > 0 ? Math.round((healthyPods / totalPods) * 100) : 0;
  const pendingPercent = totalPods > 0 ? Math.round((pendingPods / totalPods) * 100) : 0;
  const failingPercent = totalPods > 0 ? Math.round((failingPods / totalPods) * 100) : 0;
  const nodeHealthPercent = totalNodes > 0 ? Math.round((readyNodes / totalNodes) * 100) : 0;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ResourceCard
        label={t("overview.clusterVersion")}
        value={isLoading ? "..." : data?.kubernetes_version ?? t("common.unknown")}
        description={isError ? t("events.live.error") : data?.cluster_name ?? t("common.unknown")}
        trend={
          <Badge variant="success" size="sm" className={badgePresets.label}>
            {isLoading ? t("common.loading") : t("overview.clusterVersion.active")}
          </Badge>
        }
      />
      <ResourceCard
        label={t("overview.nodes")}
        value={`${readyNodes}/${totalNodes}`}
        description={t("overview.nodes.desc")}
        trend={
          <Badge variant="info-light" size="sm" className={badgePresets.label}>
            {nodeHealthPercent}% {t("status.ready").toLowerCase()}
          </Badge>
        }
      />
      <ResourceCard
        label={t("overview.namespaces")}
        value={isLoading ? "..." : String(data?.namespace_count ?? 0)}
        description={t("overview.namespaces.desc")}
        trend={
          <Badge variant="neutral-light" size="sm" className={badgePresets.label}>
            {isLoading ? t("common.loading") : t("common.synced")}
          </Badge>
        }
      />
      <ResourceCard
        label={t("overview.pods")}
        value={String(totalPods)}
        description={t("overview.pods.desc", { healthy: healthyPods, pending: pendingPods, failing: failingPods })}
        trend={
          <div className="flex flex-wrap gap-1">
            <Badge variant="success-light" size="sm" className={badgePresets.metric}>
              {healthyPods} {t("status.healthy").toLowerCase()}
            </Badge>
            <Badge variant="warning-light" size="sm" className={badgePresets.metric}>
              {pendingPods} {t("status.pending").toLowerCase()}
            </Badge>
            <Badge variant="error-light" size="sm" className={badgePresets.metric}>
              {failingPods} {t("status.failed").toLowerCase()}
            </Badge>
          </div>
        }
      />
    </section>
  );
}
