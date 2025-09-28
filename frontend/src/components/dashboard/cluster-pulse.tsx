import { Activity } from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { queryKeys, fetchClusterOverview } from "@/lib/api";

export function ClusterPulse() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });

  const metrics = useMemo(() => {
    if (!data) {
      return [
        { label: "Healthy pods", value: 0, description: "0 / 0", tone: "emerald" as const },
        { label: "Pending pods", value: 0, description: "0", tone: "amber" as const },
        { label: "Failing pods", value: 0, description: "0", tone: "rose" as const },
      ];
    }

    const total = data.total_pods || 0;
    const healthy = data.healthy_pods || 0;
    const pending = data.pending_pods || 0;
    const failing = data.failing_pods || 0;

    const toPercent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

    return [
      {
        label: "Healthy pods",
        value: toPercent(healthy),
        description: `${healthy}/${total}`,
        tone: "emerald" as const,
      },
      {
        label: "Pending pods",
        value: toPercent(pending),
        description: `${pending}`,
        tone: "amber" as const,
      },
      {
        label: "Failing pods",
        value: toPercent(failing),
        description: `${failing}`,
        tone: "rose" as const,
      },
    ];
  }, [data]);

  const colors = {
    emerald: "from-emerald-400 via-emerald-500 to-emerald-600",
    amber: "from-amber-400 via-amber-500 to-amber-600",
    rose: "from-rose-400 via-rose-500 to-rose-600",
  } as const;

  return (
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-gradient-to-br from-slate-950/90 via-slate-900/70 to-slate-950/90">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.22),transparent_70%)]"
        aria-hidden
      />
      <CardHeader className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
              <Activity className="h-4 w-4 text-cyan-200" aria-hidden />
            </span>
            Cluster pulse
          </CardTitle>
          <CardDescription>Live pod health derived from the Kubernetes API server.</CardDescription>
        </div>
        <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-100">
          {isLoading ? "Polling" : `Updated ${data?.generated_at ? new Date(data.generated_at).toLocaleTimeString() : "now"}`}
        </Badge>
      </CardHeader>
      <CardContent className="relative z-10 space-y-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-200">
              <span>{metric.label}</span>
              <span>{metric.value}% ({metric.description})</span>
            </div>
            <Progress
              value={metric.value}
              className="h-2 bg-white/10"
              indicatorClassName={`bg-gradient-to-r ${colors[metric.tone]}`}
            />
          </div>
        ))}
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">
          Source: Kubernetes /api/v1/pods (rolling sample)
        </p>
      </CardContent>
    </Card>
  );
}

