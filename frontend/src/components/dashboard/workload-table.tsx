import { ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchWorkloads, queryKeys, WorkloadStatus } from "@/lib/api";

const statusPalette: Record<WorkloadStatus, { badge: "healthy" | "warning" | "critical" | "info"; label: string }> = {
  Healthy: { badge: "healthy", label: "Healthy" },
  Warning: { badge: "warning", label: "Warning" },
  Degraded: { badge: "critical", label: "Degraded" },
  Unknown: { badge: "info", label: "Unknown" },
};

function formatReplicaCount(desired: number | null, ready: number | null) {
  if (desired == null && ready == null) {
    return "-";
  }
  return `${ready ?? 0} / ${desired ?? 0}`;
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "–";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function WorkloadTable() {
  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  const rows = workloads ?? [];

  return (
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-[var(--canvas-panel)]/80">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.18),transparent_65%)]"
        aria-hidden
      />
      <CardHeader className="relative z-10 flex flex-row items-center justify-between gap-6">
        <div>
          <CardTitle className="text-lg text-white">Workload status</CardTitle>
          <CardDescription>Deployments fetched directly from the active cluster.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 bg-white/5 text-xs uppercase tracking-[0.3em] text-slate-200"
          disabled
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent className="relative z-10 overflow-x-auto">
        <table className="min-w-full text-sm text-slate-200">
          <thead className="text-xs uppercase tracking-[0.2em] text-[color:var(--canvas-muted)]">
            <tr className="border-b border-[var(--canvas-border)]">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Namespace</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Version</th>
              <th className="px-4 py-3 text-left">Replicas</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-[color:var(--canvas-muted)]">
                  Loading workloads…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-rose-200">
                  Failed to load workload data.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-[color:var(--canvas-muted)]">
                  No workloads reported by the cluster.
                </td>
              </tr>
            ) : (
              rows.map((workload) => {
                const palette = statusPalette[workload.status] ?? statusPalette.Unknown;
                return (
                  <tr key={`${workload.namespace}-${workload.name}`} className="border-b border-[color:var(--canvas-border)]/60 last:border-none">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{workload.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[color:var(--canvas-muted)]">{workload.namespace}</td>
                    <td className="whitespace-nowrap px-4 py-3">{workload.kind}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                      {workload.version ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatReplicaCount(workload.replicas_desired, workload.replicas_ready)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={palette.badge} label={palette.label} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[color:var(--canvas-muted)]">
                      {formatTimestamp(workload.updated_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
