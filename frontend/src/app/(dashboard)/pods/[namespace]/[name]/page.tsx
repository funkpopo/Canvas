"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Button } from "@/shared/ui/button";
import {
  fetchContainerSeries,
  fetchMetricsStatus,
  fetchPodDetail,
  queryKeys,
  type ContainerMetricSeriesResponse,
  type PodDetailResponse,
} from "@/lib/api";
import { SimpleLineChart } from "@/shared/ui/line-chart";
import { useI18n } from "@/shared/i18n/i18n";
import { formatBytes, formatMillicores } from "@/lib/utils";
import { PodLogs } from "@/features/pods/components/pod-logs";
import { PodTerminal } from "@/features/pods/components/pod-terminal";

export default function PodDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.namespace);
  const name = decodeURIComponent(params.name);

  const { data: pod, isLoading, isError } = useQuery<PodDetailResponse>({
    queryKey: queryKeys.podDetail(ns, name),
    queryFn: () => fetchPodDetail(ns, name),
  });

  const { data: metricsStatus } = useQuery({ queryKey: queryKeys.metricsStatus, queryFn: fetchMetricsStatus });

  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [window, setWindow] = useState<string>("10m");

  // Derive container name list for this pod
  const containersForPod = useMemo(() => (pod?.containers ?? []).map((c) => c.name), [pod]);

  // Initialize/validate selected container when pod/containers change
  useEffect(() => {
    if (!pod) return;
    if (containersForPod.length === 0) {
      setSelectedContainer("");
      return;
    }
    if (!selectedContainer || !containersForPod.includes(selectedContainer)) {
      setSelectedContainer(containersForPod[0] ?? "");
    }
  }, [pod, containersForPod, selectedContainer]);

  const { data: series } = useQuery<ContainerMetricSeriesResponse>({
    queryKey: queryKeys.containerSeries(ns, name, selectedContainer, window),
    queryFn: () => fetchContainerSeries(ns, name, selectedContainer, window),
    enabled: Boolean(selectedContainer),
    staleTime: 10_000,
  });

  // API/WS base hosts
  const apiBase = useMemo(() => {
    const full = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
    // strip trailing /api/v1 if present
    try {
      const u = new URL(full);
      const path = u.pathname.replace(/\/$/, "");
      if (path.endsWith("/api/v1")) {
        u.pathname = path.slice(0, -"/api/v1".length) || "/";
        return u.origin + u.pathname.replace(/\/$/, "");
      }
      return u.origin + u.pathname.replace(/\/$/, "");
    } catch {
      return "http://localhost:8000";
    }
  }, []);
  const wsBase = useMemo(() => {
    if (typeof window !== "undefined") {
      const env = (process.env.NEXT_PUBLIC_WS_BASE_URL as string | undefined) ?? undefined;
      if (env) return env;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${window.location.hostname}:8000`;
    }
    return "ws://localhost:8000";
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("pod.header.eyebrow")}
        title={name}
        description={`${t("pod.header.desc")} ${ns}`}
        actions={<Button variant="outline" onClick={() => router.push("/pods")}>{t("pod.header.back")}</Button>}
        meta={
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("pod.meta.node")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{pod?.node_name || "-"}</p>
              <p className="text-xs text-text-muted">{pod?.node_ip || "-"}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("pod.meta.podIP")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{pod?.pod_ip || "-"}</p>
              <p className="text-xs text-text-muted">{pod?.phase || t("common.unknown")}</p>
            </div>
          </div>
        }
      />

      {isLoading ? (
        <Card><CardContent className="py-8 text-center text-text-muted">{t("common.loading")}</CardContent></Card>
      ) : isError || !pod ? (
        <Card><CardContent className="py-8 text-center text-text-muted">{t("pod.error")}</CardContent></Card>
      ) : (
        <>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
              <TabsTrigger value="logs">{t("tabs.logs")}</TabsTrigger>
              <TabsTrigger value="terminal">{t("tabs.terminal")}</TabsTrigger>
              <TabsTrigger value="port">{t("tabs.portForward")}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("pod.cont.title")}</CardTitle>
              <CardDescription>{t("pod.cont.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr className="text-left text-text-muted">
                      <th className="px-3 py-2">{t("pod.cont.name")}</th>
                      <th className="px-3 py-2">{t("pod.cont.ready")}</th>
                      <th className="px-3 py-2">{t("pod.cont.restarts")}</th>
                      <th className="px-3 py-2">{t("pod.cont.image")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pod.containers ?? []).map((c) => (
                      <tr key={c.name} className="border-t border-border">
                        <td className="px-3 py-2">
                          <button className="text-primary hover:underline" onClick={() => setSelectedContainer(c.name)}>{c.name}</button>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={c.ready ? "ready" : "warning"} label={c.ready ? t("status.ready") : t("status.notReady")} size="sm" />
                        </td>
                        <td className="px-3 py-2">{c.restart_count ?? 0}</td>
                        <td className="px-3 py-2 font-mono">{c.image || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{t("deploy.cont.title")}</CardTitle>
                  <CardDescription>{t("deploy.cont.desc")}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <select value={window} onChange={(e) => setWindow(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-sm">
                    <option value="10m">{t("deploy.cont.range.10m")}</option>
                    <option value="30m">{t("deploy.cont.range.30m")}</option>
                    <option value="1h">{t("deploy.cont.range.1h")}</option>
                    <option value="3h">{t("deploy.cont.range.3h")}</option>
                    <option value="6h">{t("deploy.cont.range.6h")}</option>
                    <option value="12h">{t("deploy.cont.range.12h")}</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Container chips */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {containersForPod.map((c) => {
                  const sel = selectedContainer === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedContainer(c)}
                      className={`${sel ? "bg-emerald-500/10 text-emerald-600" : "bg-background text-text-primary"} border border-border rounded px-2 py-1 text-xs`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              {!metricsStatus?.installed || !metricsStatus?.healthy ? (
                <div className="text-sm text-text-muted">{t("deploy.cont.metricsUnavailable")}</div>
              ) : !selectedContainer ? (
                <div className="text-sm text-text-muted">{t("deploy.cont.selectPrompt")}</div>
              ) : !series || series.points.length === 0 ? (
                <div className="text-sm text-text-muted">{t("deploy.cont.noMetrics", { name: selectedContainer })}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className={`${badgePresets.label} mb-2 text-text-muted`}>{t("deploy.chart.cpu")}</div>
                    <SimpleLineChart
                      data={(series.points ?? []).map((p) => ({ ts: p.ts, value: p.cpu_mcores }))}
                      stroke="#3b82f6"
                      yLabel={t("deploy.chart.cpuY", { value: formatMillicores(series.points[series.points.length - 1]?.cpu_mcores ?? 0) })}
                      formatY={(v) => formatMillicores(v)}
                      height={180}
                    />
                  </div>
                  <div>
                    <div className={`${badgePresets.label} mb-2 text-text-muted`}>{t("deploy.chart.mem")}</div>
                    <SimpleLineChart
                      data={(series.points ?? []).map((p) => ({ ts: p.ts, value: p.memory_bytes }))}
                      stroke="#10b981"
                      yLabel={t("deploy.chart.memY", { value: formatBytes(series.points[series.points.length - 1]?.memory_bytes ?? 0) })}
                      formatY={(v) => formatBytes(v)}
                      height={180}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("pod.logs.title")}</CardTitle>
                  <CardDescription>{t("pod.logs.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <label>{t("deploy.cont.container")}</label>
                    <select
                      value={selectedContainer}
                      onChange={(e) => setSelectedContainer(e.target.value)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
                    >
                      {containersForPod.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <PodLogs
                    apiBase={apiBase}
                    namespace={ns}
                    name={name}
                    container={selectedContainer || containersForPod[0]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="terminal" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("pod.term.title")}</CardTitle>
                  <CardDescription>{t("pod.term.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <label>{t("deploy.cont.container")}</label>
                    <select
                      value={selectedContainer}
                      onChange={(e) => setSelectedContainer(e.target.value)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
                    >
                      {containersForPod.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <PodTerminal
                    wsBase={wsBase}
                    namespace={ns}
                    name={name}
                    container={selectedContainer || containersForPod[0]}
                    cmd="/bin/sh"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="port" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("port.title")}</CardTitle>
                  <CardDescription>{t("port.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PortForwardCommand ns={ns} name={name} kind="pod" />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function PortForwardCommand({ ns, name, kind }: { ns: string; name: string; kind: 'pod' | 'svc' }) {
  const { t } = useI18n();
  const [localPort, setLocalPort] = useState<string>('8080');
  const [targetPort, setTargetPort] = useState<string>('80');

  const cmd = `kubectl -n ${ns} port-forward ${kind}/${name} ${localPort}:${targetPort}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      alert(t('port.copied'));
    } catch {
      // fallback
      alert(cmd);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-sm text-text-muted">{t("port.local")}</label>
          <input
            type="number"
            min={1}
            max={65535}
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm text-text-muted">{t("port.target")}</label>
          <input
            type="number"
            min={1}
            max={65535}
            value={targetPort}
            onChange={(e) => setTargetPort(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className={`${badgePresets.label} text-text-muted`}>{t('port.command')}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs overflow-x-auto">{cmd}</code>
        <Button variant="outline" size="sm" onClick={copy}>{t('port.copy')}</Button>
      </div>
      <div className="text-xs text-text-muted">{t('port.help')}</div>
    </div>
  );
}
