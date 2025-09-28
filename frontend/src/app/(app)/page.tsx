"use client";

import { Shield, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { ClusterCapacity } from "@/components/dashboard/cluster-capacity";
import { ClusterPulse } from "@/components/dashboard/cluster-pulse";
import { EventFeed } from "@/components/dashboard/event-feed";
import { OverviewGrid } from "@/components/dashboard/overview-grid";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { WorkloadTable } from "@/components/dashboard/workload-table";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchClusterOverview, fetchWorkloads, queryKeys } from "@/lib/api";

export default function DashboardPage() {
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
        eyebrow="Realtime observability"
        title="Canvas control center"
        description="Monitor clusters, surface risks, and orchestrate workloads with confidence."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
            >
              <Shield className="h-4 w-4" aria-hidden />
              Enable guardrails
            </Button>
            <Button type="button" className="bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-900 hover:from-teal-300 hover:to-cyan-400">
              <Sparkles className="h-4 w-4" aria-hidden />
              Launch command center
            </Button>
          </>
        }
        meta={
          <>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Node readiness</p>
              <p className="mt-1 text-lg font-semibold text-white">{readyNodes} / {totalNodes}</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Ready nodes reporting from the control plane.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Namespaces discovered</p>
              <p className="mt-1 text-lg font-semibold text-white">{namespaceCount}</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Live tally across the active cluster.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Pod health</p>
              <p className="mt-1 text-lg font-semibold text-white">{healthyPods} / {totalPods}</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Healthy pods sampled this minute.</p>
            </div>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
            {healthyWorkloads}/{totalWorkloads} workloads green
          </Badge>
          <Badge variant="outline" className="border-sky-400/40 bg-sky-500/10 text-sky-100">
            {overview?.cluster_name ?? "Unknown cluster"}
          </Badge>
        </div>
      </PageHeader>
      <OverviewGrid />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <ClusterPulse />
        <ClusterCapacity />
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <WorkloadTable />
        <EventFeed />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <ActivityTimeline />
        <QuickActions />
      </div>
    </div>
  );
}
