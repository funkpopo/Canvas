import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, TrendingUp, Zap } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { queryKeys, fetchClusterOverview, fetchWorkloads } from "@/lib/api";

export function ClusterCapacity() {
  const { data: overview } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });
  const { data: workloads } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  const metrics = useMemo(() => {
    const readyNodes = overview?.ready_nodes ?? 0;
    const nodeCount = overview?.node_count ?? 0;
    const totalPods = overview?.total_pods ?? 0;
    const pendingPods = overview?.pending_pods ?? 0;
    const failingPods = overview?.failing_pods ?? 0;
    const healthyWorkloads = workloads?.filter((item) => item.status === "Healthy").length ?? 0;
    const totalWorkloads = workloads?.length ?? 0;

    const ratio = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

    return [
      {
        label: "Node readiness",
        usage: `${readyNodes} / ${nodeCount}`,
        value: ratio(readyNodes, nodeCount),
        icon: Zap,
      },
      {
        label: "Workload health",
        usage: `${healthyWorkloads} / ${totalWorkloads}`,
        value: ratio(healthyWorkloads, totalWorkloads),
        icon: Gauge,
      },
      {
        label: "Pods under pressure",
        usage: `${pendingPods} pending • ${failingPods} failing`,
        value: ratio(pendingPods + failingPods, totalPods),
        icon: TrendingUp,
      },
    ];
  }, [overview, workloads]);

  const gradients = [
    "from-sky-500 via-cyan-400 to-emerald-400",
    "from-emerald-500 via-teal-400 to-sky-400",
    "from-amber-500 via-orange-400 to-rose-400",
  ];

  return (
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-[var(--canvas-panel)]/80">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--canvas-border)/30,transparent_70%)]"
        aria-hidden
      />
      <CardHeader className="relative z-10 border-white/5 pb-6">
        <CardTitle className="text-lg text-white">Cluster capacity</CardTitle>
        <CardDescription>Real-time readiness across nodes, workloads, and pod queues.</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 space-y-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-teal-200">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{metric.label}</p>
                    <p className="text-xs text-[color:var(--canvas-muted)]">{metric.usage}</p>
                  </div>
                </div>
                <span className="text-xs uppercase tracking-[0.25em] text-[color:var(--canvas-muted)]">
                  {metric.value}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Progress
                  value={metric.value}
                  className="h-2 flex-1 bg-white/10"
                  indicatorClassName={`bg-gradient-to-r ${gradients[index]}`}
                />
                <span className="w-12 text-right text-sm font-semibold text-white">{metric.value}%</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
