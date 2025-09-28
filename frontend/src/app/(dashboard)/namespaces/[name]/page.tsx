"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Button } from "@/shared/ui/button";
import {
  fetchContainerSeries,
  fetchMetricsStatus,
  fetchPodsInNamespace,
  fetchWorkloads,
  queryKeys,
  type ContainerMetricSeriesResponse,
  type PodWithContainersResponse,
} from "@/lib/api";
import { SimpleLineChart } from "@/shared/ui/line-chart";
import { formatBytes, formatMillicores } from "@/lib/utils";

export default function NamespaceDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.name);

  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.workloads, ns],
    queryFn: fetchWorkloads,
  });

  const filtered = (workloads ?? []).filter((w) => w.namespace === ns);

  // Metrics + container discovery
  const { data: metricsStatus } = useQuery({ queryKey: queryKeys.metricsStatus, queryFn: fetchMetricsStatus });
  const { data: pods } = useQuery({
    queryKey: queryKeys.podsInNamespace(ns),
    queryFn: () => fetchPodsInNamespace(ns),
  });

  const [selectedPod, setSelectedPod] = useState<string>("");
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [window, setWindow] = useState<string>("10m");

  useEffect(() => {
    if (!pods || pods.length === 0) return;
    // Initialize selection if not set
    if (!selectedPod) {
      const firstPod = pods[0];
      setSelectedPod(firstPod.name);
      setSelectedContainer(firstPod.containers[0] ?? "");
    } else {
      // Ensure the selected container exists in the selected pod
      const p = pods.find((p) => p.name === selectedPod);
      if (p && p.containers.length > 0) {
        if (!p.containers.includes(selectedContainer)) {
          setSelectedContainer(p.containers[0]);
        }
      }
    }
  }, [pods, selectedPod, selectedContainer]);

  const containerQueryEnabled = Boolean(selectedPod && selectedContainer);
  const { data: series } = useQuery<ContainerMetricSeriesResponse>({
    queryKey: queryKeys.containerSeries(ns, selectedPod, selectedContainer, window),
    queryFn: () => fetchContainerSeries(ns, selectedPod, selectedContainer, window),
    enabled: containerQueryEnabled,
    staleTime: 10_000,
  });

  const containersForSelectedPod = useMemo(() => {
    const p = (pods ?? []).find((p) => p.name === selectedPod);
    return p?.containers ?? [];
  }, [pods, selectedPod]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Namespace"
        title={ns}
        description="View and manage workloads in this namespace."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/namespaces")}>Back</Button>
          </div>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Workloads</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{filtered.length}</p>
              <p className="text-xs text-text-muted">Deployments/StatefulSets/CronJobs</p>
            </div>
          </>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-text-muted">Loading workloads...</p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-text-muted">Failed to load workloads.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-text-muted">No workloads found in this namespace.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((workload) => (
            <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base text-text-primary">{workload.name}</CardTitle>
                    <CardDescription>{workload.kind}</CardDescription>
                  </div>
                  <StatusBadge
                    status={workload.status === "Healthy" ? "ready" : "warning"}
                    label={workload.status}
                    size="sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Replicas</span>
                  <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                    {workload.replicas_ready ?? 0}/{workload.replicas_desired ?? 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Version</span>
                  <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                    {workload.version || "N/A"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Container details with CPU/Memory charts */}
      <Card className="relative overflow-hidden border-border bg-surface">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-text-primary">Container details</CardTitle>
              <CardDescription>
                CPU and Memory usage as line charts. Default range: last 10 minutes.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Pod select */}
              <label className="text-xs text-text-muted">Pod</label>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                value={selectedPod}
                onChange={(e) => {
                  setSelectedPod(e.target.value);
                }}
              >
                {(pods ?? []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              {/* Container select */}
              <label className="text-xs text-text-muted">Container</label>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                value={selectedContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
              >
                {containersForSelectedPod.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {/* Time window select – show only when metrics-server is healthy */}
              {metricsStatus?.healthy ? (
                <>
                  <label className="text-xs text-text-muted">Range</label>
                  <select
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                    value={window}
                    onChange={(e) => setWindow(e.target.value)}
                  >
                    <option value="10m">Last 10m</option>
                    <option value="30m">Last 30m</option>
                    <option value="1h">Last 1h</option>
                    <option value="3h">Last 3h</option>
                    <option value="6h">Last 6h</option>
                    <option value="12h">Last 12h</option>
                  </select>
                </>
              ) : (
                <span className="text-xs text-text-muted">Metrics-server unavailable</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(!series || series.points.length === 0) ? (
            <div className="py-8 text-center text-sm text-text-muted">No metrics available for the selected container.</div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className={`${badgePresets.label} mb-2 text-text-muted`}>CPU usage</div>
                <SimpleLineChart
                  data={(series?.points ?? []).map((p) => ({ ts: p.ts, value: p.cpu_mcores }))}
                  stroke="#3b82f6"
                  yLabel={`CPU (${formatMillicores((series?.points?.[series.points.length - 1]?.cpu_mcores) ?? 0)})`}
                  formatY={(v) => formatMillicores(v)}
                  height={180}
                />
              </div>
              <div>
                <div className={`${badgePresets.label} mb-2 text-text-muted`}>Memory usage</div>
                <SimpleLineChart
                  data={(series?.points ?? []).map((p) => ({ ts: p.ts, value: p.memory_bytes }))}
                  stroke="#10b981"
                  yLabel={`Memory (${formatBytes((series?.points?.[series.points.length - 1]?.memory_bytes) ?? 0)})`}
                  formatY={(v) => formatBytes(v)}
                  height={180}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
