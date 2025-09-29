"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { SimpleLineChart } from "@/shared/ui/line-chart";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useI18n } from "@/shared/i18n/i18n";
import { Modal } from "@/shared/ui/modal";
import { cn, formatBytes, formatMillicores } from "@/lib/utils";
import {
  queryKeys,
  fetchNodeDetail,
  fetchNodeEvents,
  fetchNodeMetrics,
  fetchNodeSeries,
  fetchNodePods,
  fetchNodeYaml,
  updateNodeYaml,
  setNodeSchedulable,
  drainNode,
  patchNodeLabels,
  patchNodeTaints,
  deleteNodeByName,
  type EventMessageResponse,
  type NodeDetailResponse,
  type NodeMetricsResponse,
  type NodeMetricSeriesResponse,
  type NodePodSummaryResponse,
  type YamlContentResponse,
} from "@/lib/api";

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function NodeDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const name = decodeURIComponent(params.name);
  const qc = useQueryClient();

  const { data: detail } = useQuery<NodeDetailResponse>({ queryKey: queryKeys.nodeDetail(name), queryFn: () => fetchNodeDetail(name) });
  const { data: events } = useQuery<EventMessageResponse[]>({ queryKey: queryKeys.nodeEvents(name), queryFn: () => fetchNodeEvents(name) });
  const { data: metrics } = useQuery<NodeMetricsResponse>({ queryKey: queryKeys.nodeMetrics(name), queryFn: () => fetchNodeMetrics(name) });
  const [window, setWindow] = useState<string>("10m");
  const refetchMs = useMemo(() => {
    switch (window) {
      case "10m": return 5000;
      case "30m": return 10000;
      case "1h": return 15000;
      case "3h": return 20000;
      case "6h": return 30000;
      case "12h": return 45000;
      default: return 10000;
    }
  }, [window]);
  const { data: series } = useQuery<NodeMetricSeriesResponse>({
    queryKey: queryKeys.nodeSeries(name, window),
    queryFn: () => fetchNodeSeries(name, window),
    staleTime: refetchMs,
    gcTime: 5 * 60 * 1000,
    refetchInterval: refetchMs,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: metrics?.has_metrics !== false,
  });
  const { data: pods } = useQuery<NodePodSummaryResponse[]>({ queryKey: queryKeys.nodePods(name), queryFn: () => fetchNodePods(name) });

  const schedMut = useMutation({
    mutationFn: (schedulable: boolean) => setNodeSchedulable(name, schedulable),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodeDetail(name) });
      router.refresh();
    },
  });

  const drainMut = useMutation({
    mutationFn: () => drainNode(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodePods(name) });
      qc.invalidateQueries({ queryKey: queryKeys.nodeDetail(name) });
      alert(t("node.alert.drained"));
    },
    onError: (e: unknown) => alert((e as { message?: string })?.message || t("node.error.drain")),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteNodeByName(name),
    onSuccess: () => {
      alert(t("node.alert.deleted"));
      router.push("/nodes");
    },
    onError: (e: unknown) => alert((e as { message?: string })?.message || t("node.error.delete")),
  });

  // YAML & labels editing
  const { data: yamlContent } = useQuery<YamlContentResponse>({ queryKey: queryKeys.nodeYaml(name), queryFn: () => fetchNodeYaml(name) });
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => setYaml(yamlContent?.yaml ?? ""), [yamlContent?.yaml]);
  const yamlMut = useMutation({
    mutationFn: () => updateNodeYaml(name, yaml),
    onSuccess: () => alert(t("alert.yaml.applied")),
    onError: (e: unknown) => alert((e as { message?: string })?.message || t("error.yaml.apply")),
  });

  const [labelsText, setLabelsText] = useState<string>("");
  useEffect(() => {
    const l = detail?.labels ?? {};
    setLabelsText(JSON.stringify(l, null, 2));
  }, [detail?.labels]);
  const labelsMut = useMutation({
    mutationFn: () => {
      try {
        const obj = JSON.parse(labelsText);
        if (!obj || typeof obj !== "object") throw new Error("invalid");
        return patchNodeLabels(name, obj as Record<string, string>);
      } catch {
        alert(t("node.error.labels.invalid"));
        return Promise.reject(new Error("invalid labels"));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodeDetail(name) });
      alert(t("node.alert.labelsPatched"));
    },
    onError: (e: unknown) => alert((e as { message?: string })?.message || t("node.error.labels.patch")),
  });

  // Taints editing
  type Taint = { key: string; value?: string | null; effect: string };
  const [taints, setTaints] = useState<Taint[]>([]);
  useEffect(() => {
    setTaints((detail?.taints ?? []).map((t) => ({ key: t.key, value: t.value ?? "", effect: t.effect })));
  }, [detail?.taints]);
  const taintsMut = useMutation({
    mutationFn: () => {
      // basic validation
      for (const tnt of taints) {
        if (!tnt.key.trim()) {
          alert(t("node.error.taints.invalid"));
          return Promise.reject(new Error("invalid taint key"));
        }
      }
      const payload = taints.map((t) => ({ key: t.key.trim(), value: t.value ? String(t.value) : null, effect: t.effect }));
      return patchNodeTaints(name, payload as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nodeDetail(name) });
      alert(t("node.alert.taintsPatched"));
    },
    onError: (e: unknown) => alert((e as { message?: string })?.message || t("node.error.taints.patch")),
  });

  // Modals
  const [yamlOpen, setYamlOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [taintsOpen, setTaintsOpen] = useState(false);

  const readyStatus = detail?.status === "Ready" ? "ready" : detail?.status === "NotReady" ? "not-ready" : "unknown";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("node.header.eyebrow")}
        title={name}
        description={t("node.header.desc", {
          sched: detail?.schedulable ? t("node.schedulable") : t("node.unschedulable"),
        })}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/nodes" className="underline text-text-muted">{t("node.header.back")}</Link>
          </div>
        }
        meta={
          detail ? (
            <>
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>{t("node.meta.status")}</p>
                <div className="mt-1">
                  <StatusBadge
                    status={readyStatus as any}
                    label={detail.status === "Ready" ? t("status.ready") : detail.status === "NotReady" ? t("status.notReady") : t("common.unknown")}
                    size="sm"
                  />
                </div>
                <p className="text-xs text-text-muted">{t("node.meta.health")}</p>
              </div>
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>{t("node.meta.uptime")}</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{formatDuration(detail.uptime_seconds)}</p>
                <p className="text-xs text-text-muted">{t("node.meta.created")}: {detail.created_at ? new Date(detail.created_at).toLocaleString() : t("common.unknown")}</p>
              </div>
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>{t("node.meta.sched")}</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{detail.schedulable ? t("node.schedulable") : t("node.unschedulable")}</p>
                <p className="text-xs text-text-muted">{t("node.meta.sched.help")}</p>
              </div>
            </>
          ) : null
        }
      />

      {/* Manage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("node.manage.title")}</CardTitle>
          <CardDescription>{t("node.manage.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => schedMut.mutate(!(detail?.schedulable ?? true))} disabled={schedMut.isPending}>
            {detail?.schedulable ? t("node.manage.unschedulable") : t("node.manage.schedulable")}
          </Button>
          <Button type="button" variant="outline" onClick={() => drainMut.mutate()} disabled={drainMut.isPending}>{t("node.manage.drain")}</Button>
          <Button type="button" variant="destructive" onClick={() => { if (confirm(t("node.manage.deleteConfirm"))) deleteMut.mutate(); }} disabled={deleteMut.isPending}>{t("node.manage.delete")}</Button>

          {/* Edit actions open modals */}
          <div className="w-px h-6 bg-border mx-2" />
          <Button type="button" variant="outline" onClick={() => setYamlOpen(true)}>{t("node.yaml.edit")}</Button>
          <Button type="button" variant="outline" onClick={() => setLabelsOpen(true)}>{t("node.labels.edit")}</Button>
          <Button type="button" variant="outline" onClick={() => setTaintsOpen(true)}>{t("node.taints.edit")}</Button>
        </CardContent>
      </Card>

      {/* Resource usage (time-series) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("node.usage.title")}</CardTitle>
          <CardDescription>{t("node.usage.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!series ? (
            <div className="text-sm text-text-muted">{t("common.loading")}</div>
          ) : !series.has_metrics ? (
            <div className="text-xs text-text-muted">{t("capacity.ms.cta")}</div>
          ) : series.points.length === 0 ? (
            <div className="text-sm text-text-muted">{t("node.series.noMetrics", { name })}</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted">{t("deploy.cont.range")}</label>
                <select
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                  value={window}
                  onChange={(e) => setWindow(e.target.value)}
                >
                  <option value="10m">{t("deploy.cont.range.10m")}</option>
                  <option value="30m">{t("deploy.cont.range.30m")}</option>
                  <option value="1h">{t("deploy.cont.range.1h")}</option>
                  <option value="3h">{t("deploy.cont.range.3h")}</option>
                  <option value="6h">{t("deploy.cont.range.6h")}</option>
                  <option value="12h">{t("deploy.cont.range.12h")}</option>
                </select>
              </div>

              <div className="space-y-4">
                <div className={`${badgePresets.label} text-text-muted`}>{t("deploy.chart.cpu")}</div>
                <SimpleLineChart
                  data={(series.points ?? []).map((p) => ({ ts: p.ts, value: p.cpu_mcores }))}
                  stroke="#3b82f6"
                  yLabel={t("deploy.chart.cpuY", { value: formatMillicores(series.points[series.points.length - 1]?.cpu_mcores ?? 0) })}
                  formatY={(v) => formatMillicores(v)}
                  height={180}
                />
              </div>

              <div className="space-y-4">
                <div className={`${badgePresets.label} text-text-muted`}>{t("deploy.chart.mem")}</div>
                <SimpleLineChart
                  data={(series.points ?? []).map((p) => ({ ts: p.ts, value: p.memory_bytes }))}
                  stroke="#10b981"
                  yLabel={t("deploy.chart.memY", { value: formatBytes(series.points[series.points.length - 1]?.memory_bytes ?? 0) })}
                  formatY={(v) => formatBytes(v)}
                  height={180}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modals for editing to avoid accidental changes */}
      <Modal
        open={yamlOpen}
        onClose={() => setYamlOpen(false)}
        title={t("node.yaml.title")}
        description={t("node.yaml.desc")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setYamlOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={() => yamlMut.mutate()} disabled={yamlMut.isPending}>{t("deploy.yaml.save")}</Button>
          </div>
        }
      >
        <textarea className="w-full min-h-[400px] rounded-md border border-border bg-background p-2 font-mono text-xs text-text-primary" value={yaml} onChange={(e) => setYaml(e.target.value)} />
      </Modal>

      <Modal
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        title={t("node.labels.title")}
        description={t("node.labels.desc")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLabelsOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={() => labelsMut.mutate()} disabled={labelsMut.isPending}>{t("node.labels.apply")}</Button>
          </div>
        }
      >
        <textarea className="w-full min-h-[260px] rounded-md border border-border bg-background p-2 font-mono text-xs text-text-primary" value={labelsText} onChange={(e) => setLabelsText(e.target.value)} />
      </Modal>

      <Modal
        open={taintsOpen}
        onClose={() => setTaintsOpen(false)}
        title={t("node.taints.edit")}
        description={t("node.taints.editDesc")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTaintsOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={() => taintsMut.mutate()} disabled={taintsMut.isPending}>{t("node.taints.apply")}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {taints.length === 0 ? (
            <div className="text-xs text-text-muted">{t("node.taints.none")}</div>
          ) : null}
          {taints.map((tnt, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center gap-2">
              <input
                className="col-span-4 rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                placeholder="key"
                value={tnt.key}
                onChange={(e) => setTaints((arr) => arr.map((x, i) => i === idx ? { ...x, key: e.target.value } : x))}
              />
              <input
                className="col-span-4 rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                placeholder="value"
                value={tnt.value ?? ""}
                onChange={(e) => setTaints((arr) => arr.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
              />
              <select
                className="col-span-3 rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                value={tnt.effect}
                onChange={(e) => setTaints((arr) => arr.map((x, i) => i === idx ? { ...x, effect: e.target.value } : x))}
              >
                <option value="NoSchedule">NoSchedule</option>
                <option value="PreferNoSchedule">PreferNoSchedule</option>
                <option value="NoExecute">NoExecute</option>
              </select>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setTaints((arr) => arr.filter((_, i) => i !== idx))}
                className="col-span-1"
              >
                ✕
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaints((arr) => [...arr, { key: "", value: "", effect: "NoSchedule" }])}
            >
              + {t("node.taints.add")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Taints + OS/Runtime + Images */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-text-primary">{t("node.taints.title")}</CardTitle>
            <CardDescription>{t("node.taints.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(detail?.taints ?? []).length === 0 ? (
              <div className="text-sm text-text-muted">{t("node.taints.none")}</div>
            ) : (
              (detail?.taints ?? []).map((tnt, idx) => (
                <div key={idx} className="text-sm text-text-primary">{tnt.key}{tnt.value ? `=${tnt.value}` : ""}:{tnt.effect}</div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-text-primary">{t("node.os.title")}</CardTitle>
            <CardDescription>{t("node.os.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{t("node.os.osImage")}: {detail?.node_info?.os_image || "-"}</div>
            <div>{t("node.os.kernel")}: {detail?.node_info?.kernel_version || "-"}</div>
            <div>{t("node.os.kubelet")}: {detail?.node_info?.kubelet_version || "-"}</div>
            <div>{t("node.os.container")}: {detail?.node_info?.container_runtime_version || "-"}</div>
            <div>{t("node.os.os")}: {detail?.node_info?.operating_system || "-"}</div>
            <div>{t("node.os.arch")}: {detail?.node_info?.architecture || "-"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-text-primary">{t("node.images.title")}</CardTitle>
            <CardDescription>{t("node.images.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(detail?.images ?? []).length === 0 ? (
              <div className="text-sm text-text-muted">{t("node.images.none")}</div>
            ) : (
              (detail?.images ?? []).slice(0, 20).map((img, idx) => (
                <div key={idx} className="truncate text-sm text-text-primary" title={img}>{img}</div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("node.pods.title")}</CardTitle>
          <CardDescription>{t("node.pods.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!pods ? (
            <div className="text-sm text-text-muted">{t("common.loading")}</div>
          ) : pods.length === 0 ? (
            <div className="text-sm text-text-muted">{t("node.pods.none")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="py-2 pr-3">{t("workloadTable.th.name")}</th>
                    <th className="py-2 pr-3">{t("workloadTable.th.namespace")}</th>
                    <th className="py-2 pr-3">{t("workloadTable.th.status")}</th>
                    <th className="py-2 pr-3">{t("deploy.cont.container")}</th>
                    <th className="py-2 pr-3">{t("node.pods.restarts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pods.map((p) => (
                    <tr key={`${p.namespace}/${p.name}`} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-text-primary">{p.name}</td>
                      <td className="py-2 pr-3 text-text-primary">{p.namespace}</td>
                      <td className="py-2 pr-3 text-text-primary">{p.phase}</td>
                      <td className="py-2 pr-3 text-text-primary">{(p.containers ?? []).join(", ")}</td>
                      <td className="py-2 pr-3 text-text-primary">{p.restarts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("node.events.title")}</CardTitle>
          <CardDescription>{t("node.events.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!events || events.length === 0 ? (
            <div className="text-sm text-text-muted">{t("events.live.empty")}</div>
          ) : (
            events.slice(0, 30).map((e, idx) => (
              <div key={idx} className="flex items-start justify-between gap-4 border-b border-border/60 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">{e.reason} <span className="ml-2 text-xs text-text-muted">{e.type}</span></div>
                  <div className="text-xs text-text-muted truncate" title={e.message}>{e.message}</div>
                </div>
                <div className="text-xs text-text-muted whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
