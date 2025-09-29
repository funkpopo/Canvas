import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { badgePresets } from "@/shared/ui/badge";
import { queryKeys, fetchClusterOverview } from "@/lib/api";
import { useI18n } from "@/shared/i18n/i18n";

export function ClusterPulse() {
  const { t } = useI18n();
  const { data: overview, isLoading } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });

  const metrics = useMemo(() => {
    const readyNodes = overview?.ready_nodes ?? 0;
    const nodeCount = overview?.node_count ?? 0;
    const totalPods = overview?.total_pods ?? 0;
    const healthyPods = overview?.healthy_pods ?? 0;
    const pendingPods = overview?.pending_pods ?? 0;
    const failingPods = overview?.failing_pods ?? 0;

    const nodeHealth = nodeCount > 0 ? Math.round((readyNodes / nodeCount) * 100) : 0;
    const podHealth = totalPods > 0 ? Math.round((healthyPods / totalPods) * 100) : 0;
    const podSuccess = totalPods > 0 ? Math.round(((healthyPods + pendingPods) / totalPods) * 100) : 0;

    return [
      {
        label: t("pulse.api"),
        value: overview ? 95 : 0, // Assume good if we can fetch data
        description: overview ? t("pulse.api.ok") : t("pulse.api.fail"),
      },
      {
        label: t("pulse.node"),
        value: nodeHealth,
        description: t("pulse.node.desc", { ready: readyNodes, total: nodeCount }),
      },
      {
        label: t("pulse.pod.success"),
        value: podSuccess,
        description: t("pulse.pod.success.desc", { healthy: healthyPods, pending: pendingPods, failing: failingPods }),
      },
      {
        label: t("pulse.conn"),
        value: podHealth,
        description: t("pulse.conn.desc", { percent: podHealth }),
      },
    ];
  }, [overview]);

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">{t("pulse.title")}</CardTitle>
        <CardDescription>{t("pulse.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">{t("pulse.loading")}</p>
          </div>
        ) : (
          metrics.map((metric) => (
            <div key={metric.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{metric.label}</span>
                <span className="font-medium text-text-primary">{metric.value}%</span>
              </div>
              <Progress
                value={metric.value}
                className="h-2"
              />
              <p className="text-xs text-text-muted">{metric.description}</p>
            </div>
          ))
        )}
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <p className={`${badgePresets.label} text-text-muted`}>
            {t("pulse.updated")}
          </p>
          <p className="text-sm font-medium text-text-primary">
            {overview?.generated_at ? new Date(overview.generated_at).toLocaleString() : t("common.never")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


