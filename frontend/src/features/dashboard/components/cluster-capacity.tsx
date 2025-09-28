import { Cpu, HardDrive, MemoryStick, Users } from "lucide-react";
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

export function ClusterCapacity() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });

  // TODO: Replace with actual capacity metrics when available
  const metrics = [
    {
      label: "CPU",
      icon: Cpu,
      value: 0,
      usage: "No capacity data available",
      color: "bg-chart-1",
    },
    {
      label: "Memory",
      icon: MemoryStick,
      value: 0,
      usage: "No capacity data available",
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
      value: data?.total_pods ? Math.min((data.total_pods / 110) * 100, 100) : 0,
      usage: `${data?.total_pods ?? 0} pods running`,
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
        {isLoading ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Loading capacity metrics...</p>
          </div>
        ) : (
          metrics.map((metric) => {
            const Icon = metric.icon;
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
      </CardContent>
    </Card>
  );
}

