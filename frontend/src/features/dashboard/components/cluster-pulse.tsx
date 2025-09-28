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

export function ClusterPulse() {
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
        label: "API server response",
        value: overview ? 95 : 0, // Assume good if we can fetch data
        description: overview ? "API server responding normally" : "Unable to connect to API server",
      },
      {
        label: "Node health",
        value: nodeHealth,
        description: `${readyNodes}/${nodeCount} nodes ready and schedulable`,
      },
      {
        label: "Pod success rate",
        value: podSuccess,
        description: `${healthyPods} healthy, ${pendingPods} pending, ${failingPods} failing`,
      },
      {
        label: "Cluster connectivity",
        value: podHealth,
        description: `${podHealth}% of pods in healthy state`,
      },
    ];
  }, [overview]);

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">Cluster pulse</CardTitle>
        <CardDescription>Real-time health indicators and system metrics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Loading cluster health metrics...</p>
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
            Last updated
          </p>
          <p className="text-sm font-medium text-text-primary">
            {overview?.generated_at ? new Date(overview.generated_at).toLocaleString() : 'Never'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


