import { AlertTriangle, Cpu, HardDrive, MemoryStick, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { Badge, badgePresets } from "@/shared/ui/badge";
import {
  queryKeys,
  fetchClusterOverview,
  fetchClusterCapacity,
  fetchMetricsStatus,
  installMetricsServer,
} from "@/lib/api";
import { Button } from "@/shared/ui/button";
import { cn, formatBytes, formatMillicores } from "@/lib/utils";

export function ClusterCapacity() {
  const queryClient = useQueryClient();
  const { data: overview, isLoading: isLoadingOverview } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });
  const { data: capacity, isLoading: isLoadingCapacity } = useQuery({
    queryKey: queryKeys.clusterCapacity,
    queryFn: fetchClusterCapacity,
  });
  const { data: metricsStatus } = useQuery({
    queryKey: queryKeys.metricsStatus,
    queryFn: fetchMetricsStatus,
  });

  const installMutation = useMutation({
    mutationFn: async (insecure: boolean) => installMetricsServer(insecure),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.metricsStatus }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterCapacity }),
      ]);
    },
  });

  // TODO: Replace with actual capacity metrics when available
  const cpuPercent = capacity?.cpu_percent ? Math.round(capacity.cpu_percent) : 0;
  const memPercent = capacity?.memory_percent ? Math.round(capacity.memory_percent) : 0;

  const totalPods = overview?.total_pods ?? 0;
  const healthyPods = overview?.healthy_pods ?? 0;
  const pendingPods = overview?.pending_pods ?? 0;
  const failingPods = overview?.failing_pods ?? 0;
  const unhealthyPods = pendingPods + failingPods;

  const metrics = [
    {
      label: "CPU",
      icon: Cpu,
      value: cpuPercent,
      usage: capacity?.has_metrics
        ? `${formatMillicores(capacity?.cpu_used_mcores ?? 0)} of ${formatMillicores(
            capacity?.cpu_total_mcores ?? 0,
          )}`
        : "Install metrics-server to view usage",
      color: "bg-chart-1",
    },
    {
      label: "Memory",
      icon: MemoryStick,
      value: memPercent,
      usage: capacity?.has_metrics
        ? `${formatBytes(capacity?.memory_used_bytes ?? 0)} of ${formatBytes(
            capacity?.memory_total_bytes ?? 0,
          )}`
        : "Install metrics-server to view usage",
      color: "bg-chart-2",
    },
    {
      label: "Storage",
      icon: HardDrive,
      value: 0,
      usage: "No capacity data available",
      color: "bg-chart-3",
    },
    {
      label: "Pods",
      icon: Users,
      value: 0,
      usage: `${totalPods} total pods`,
      color: "bg-chart-4",
    },
  ];

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">Cluster capacity</CardTitle>
        <CardDescription>Resource utilization and allocation across nodes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoadingOverview || isLoadingCapacity ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Loading capacity metrics...</p>
          </div>
        ) : (
          metrics.map((metric) => {
            const Icon = metric.icon;
            // Special rendering for Pods: show healthy vs unhealthy counts instead of a progress bar
            if (metric.label === "Pods") {
              return (
                <div key={metric.label} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-accent">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{metric.label}</p>
                        <p className="text-xs text-text-muted">{metric.usage}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success-light" size="sm" className={badgePresets.metric}>
                        {healthyPods} healthy
                      </Badge>
                      <Badge variant="error-light" size="sm" className={badgePresets.metric}>
                        {unhealthyPods} unhealthy
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={metric.label} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-accent">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{metric.label}</p>
                      <p className="text-xs text-text-muted">{metric.usage}</p>
                    </div>
                  </div>
                  <span className={`${badgePresets.metric} text-text-muted`}>
                    {metric.value}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Progress
                    value={metric.value}
                    className="h-2 flex-1"
                    indicatorClassName={metric.color}
                  />
                  <span className="w-12 text-right text-sm font-semibold text-text-primary">{metric.value}%</span>
                </div>
              </div>
            );
          })
        )}

        {!capacity?.has_metrics && (
          <div className={cn(
            "mt-2 rounded-md border border-border bg-muted/40 p-3 text-xs",
            "flex items-center justify-between gap-3",
          )}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-accent">
                <AlertTriangle className="h-3 w-3" aria-hidden />
              </span>
              <div>
                <p className="font-medium text-text-primary">metrics-server not detected</p>
                <p className="text-text-muted">
                  Install metrics-server to enable live CPU/Memory usage.
                </p>
                {metricsStatus?.message && (
                  <p className="mt-1 text-text-muted">{metricsStatus.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={installMutation.isPending}
                onClick={() => installMutation.mutate(true)}
              >
                {installMutation.isPending ? "Installing..." : "Install metrics-server"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

