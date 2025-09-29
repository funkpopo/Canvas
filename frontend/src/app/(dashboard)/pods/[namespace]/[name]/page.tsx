"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  fetchPodDetail,
  queryKeys,
  type ContainerMetricSeriesResponse,
  type PodDetailResponse,
} from "@/lib/api";
import { SimpleLineChart } from "@/shared/ui/line-chart";
import { useI18n } from "@/shared/i18n/i18n";
import { formatBytes, formatMillicores } from "@/lib/utils";

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

  useEffect(() => {
    if (!pod) return;
    if (!selectedContainer) {
      const first = pod.containers[0]?.name || "";
      setSelectedContainer(first);
    }
  }, [pod, selectedContainer]);

  const { data: series } = useQuery<ContainerMetricSeriesResponse>({
    queryKey: queryKeys.containerSeries(ns, name, selectedContainer, window),
    queryFn: () => fetchContainerSeries(ns, name, selectedContainer, window),
    enabled: Boolean(selectedContainer),
    staleTime: 10_000,
  });

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
                  <select
                    value={selectedContainer}
                    onChange={(e) => setSelectedContainer(e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
                  >
                    {(pod.containers ?? []).map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
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
              {!metricsStatus?.installed || !metricsStatus?.healthy ? (
                <div className="text-sm text-text-muted">{t("deploy.cont.metricsUnavailable")}</div>
              ) : !selectedContainer ? (
                <div className="text-sm text-text-muted">{t("deploy.cont.selectPrompt")}</div>
              ) : !series || series.points.length === 0 ? (
                <div className="text-sm text-text-muted">{t("deploy.cont.noMetrics", { name: selectedContainer })}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SimpleLineChart
                    title={t("deploy.chart.cpu")}
                    yLabel={t("deploy.chart.cpuY", { value: "m" })}
                    series={[
                      {
                        id: "cpu",
                        color: "#16a34a",
                        values: series.points.map((p) => ({ x: new Date(p.ts).getTime(), y: p.cpu_mcores })),
                        formatY: (v) => formatMillicores(v as number),
                      },
                    ]}
                  />
                  <SimpleLineChart
                    title={t("deploy.chart.mem")}
                    yLabel={t("deploy.chart.memY", { value: "bytes" })}
                    series={[
                      {
                        id: "mem",
                        color: "#3b82f6",
                        values: series.points.map((p) => ({ x: new Date(p.ts).getTime(), y: p.memory_bytes })),
                        formatY: (v) => formatBytes(v as number),
                      },
                    ]}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

