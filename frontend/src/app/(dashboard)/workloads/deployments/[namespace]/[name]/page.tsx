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
import { formatBytes, formatMillicores } from "@/lib/utils";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { useI18n } from "@/shared/i18n/i18n";
import {
  fetchDeploymentPods,
  fetchWorkloads,
  fetchContainerSeries,
  fetchMetricsStatus,
  fetchDeploymentYaml,
  updateDeploymentYaml,
  restartDeployment,
  scaleDeployment,
  deleteDeployment,
  queryKeys,
  type ContainerMetricSeriesResponse,
  type PodWithContainersResponse,
  type WorkloadSummaryResponse,
} from "@/lib/api";

export default function DeploymentDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.namespace);
  const name = decodeURIComponent(params.name);
  const qc = useQueryClient();

  // Fetch workload summary to show replicas/status info
  const { data: workloads } = useQuery({ queryKey: queryKeys.workloads, queryFn: fetchWorkloads });
  const deployment: WorkloadSummaryResponse | undefined = useMemo(
    () => (workloads ?? []).find((w) => w.kind === "Deployment" && w.namespace === ns && w.name === name),
    [workloads, ns, name]
  );

  // Pods/containers + metrics status
  const { data: metricsStatus } = useQuery({ queryKey: queryKeys.metricsStatus, queryFn: fetchMetricsStatus });
  const { data: pods } = useQuery({
    queryKey: queryKeys.deploymentPods(ns, name),
    queryFn: () => fetchDeploymentPods(ns, name),
  });

  const [selectedPod, setSelectedPod] = useState<string>("");
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [window, setWindow] = useState<string>("10m");

  // Initialize selections when pods load
  useEffect(() => {
    if (!pods || pods.length === 0) return;
    if (!selectedPod) {
      setSelectedPod(pods[0].name);
    } else if (!pods.some((p) => p.name === selectedPod)) {
      setSelectedPod(pods[0].name);
    }
  }, [pods, selectedPod]);

  // Containers for selected pod
  const containersForSelectedPod = useMemo(() => {
    const p = (pods ?? []).find((p) => p.name === selectedPod);
    return p?.containers ?? [];
  }, [pods, selectedPod]);

  // Ensure selectedContainer is valid/defaults to first
  useEffect(() => {
    if (containersForSelectedPod.length === 0) {
      setSelectedContainer("");
      return;
    }
    if (!selectedContainer || !containersForSelectedPod.includes(selectedContainer)) {
      setSelectedContainer(containersForSelectedPod[0]);
    }
  }, [containersForSelectedPod, selectedContainer]);

  const containerQueryEnabled = Boolean(selectedPod && selectedContainer);
  const { data: series } = useQuery<ContainerMetricSeriesResponse>({
    queryKey: queryKeys.containerSeries(ns, selectedPod, selectedContainer, window),
    queryFn: () => fetchContainerSeries(ns, selectedPod, selectedContainer, window),
    enabled: containerQueryEnabled,
    staleTime: 10_000,
  });

  // Actions: restart, scale, delete, yaml
  const restartMut = useMutation({
    mutationFn: () => restartDeployment(ns, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workloads });
      alert(t("alert.deploy.restarted"));
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.deploy.restart"));
    },
  });

  const [replicasInput, setReplicasInput] = useState<number | "">(deployment?.replicas_desired ?? "");
  useEffect(() => {
    if (deployment?.replicas_desired != null) setReplicasInput(deployment.replicas_desired);
  }, [deployment?.replicas_desired]);
  const scaleMut = useMutation({
    mutationFn: (replicas: number) => scaleDeployment(ns, name, replicas),
    onSuccess: (_res, replicas) => {
      // Optimistically update workloads cache so UI reflects new desired replicas immediately
      qc.setQueryData(queryKeys.workloads, (prev: WorkloadSummaryResponse[] | undefined) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((w: WorkloadSummaryResponse) =>
          w.kind === "Deployment" && w.namespace === ns && w.name === name
            ? { ...w, replicas_desired: replicas }
            : w
        );
      });
      setReplicasInput(replicas);
      qc.invalidateQueries({ queryKey: queryKeys.workloads });
      qc.invalidateQueries({ queryKey: queryKeys.deploymentPods(ns, name) });
      qc.invalidateQueries({ queryKey: queryKeys.deploymentYaml(ns, name) });
      router.refresh();
      alert(t("alert.deploy.replicasUpdated"));
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.deploy.scale"));
    },
  });

  const delMut = useMutation({
    mutationFn: () => deleteDeployment(ns, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workloads });
      alert(t("alert.deploy.deleted"));
      router.push("/workloads");
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.deploy.delete"));
    },
  });

  const { data: yamlContent } = useQuery({
    queryKey: queryKeys.deploymentYaml(ns, name),
    queryFn: () => fetchDeploymentYaml(ns, name),
  });
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => setYaml(yamlContent?.yaml ?? ""), [yamlContent?.yaml]);
  const yamlMut = useMutation({
    mutationFn: () => updateDeploymentYaml(ns, name, yaml),
    onSuccess: () => alert(t("alert.yaml.applied")),
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.yaml.apply"));
    },
  });

  // Container edit/delete via YAML helpers
  type K8sContainer = {
    name: string;
    image?: string;
    resources?: {
      requests?: Record<string, string>;
      limits?: Record<string, string>;
    };
  };
  type K8sDeployment = {
    kind?: string;
    spec?: { template?: { spec?: { containers?: K8sContainer[] } } };
  };

  function extractContainersFromYaml(y: string): K8sContainer[] {
    try {
      const obj = parseYaml(y) as K8sDeployment;
      return obj?.spec?.template?.spec?.containers ?? [];
    } catch {
      return [];
    }
  }

  function replaceContainersInYaml(y: string, containers: K8sContainer[]): string {
    const base: K8sDeployment = ((): K8sDeployment => {
      try { return parseYaml(y) as K8sDeployment; } catch { return {}; }
    })();
    const prevSpec = base.spec ?? {};
    const prevTemplate = prevSpec.template ?? {};
    const prevPodSpec = prevTemplate.spec ?? {};
    const next: K8sDeployment = {
      ...base,
      spec: {
        ...prevSpec,
        template: {
          ...prevTemplate,
          spec: {
            ...prevPodSpec,
            containers,
          },
        },
      },
    };
    return stringifyYaml(next as unknown as Record<string, unknown>);
  }

  function getContainerByName(y: string, cname: string): K8sContainer | undefined {
    return extractContainersFromYaml(y).find(c => c.name === cname);
  }

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editImage, setEditImage] = useState("");

  useEffect(() => {
    if (!isEditOpen || !selectedContainer) return;
    try {
      const obj = parseYaml(yaml) as K8sDeployment;
      const c = obj?.spec?.template?.spec?.containers?.find(x => x.name === selectedContainer);
      setEditImage(c?.image ?? "");
    } catch {
      setEditImage("");
    }
  }, [isEditOpen, selectedContainer, yaml]);

  const applyYamlMut = useMutation({
    mutationFn: (newYaml: string) => updateDeploymentYaml(ns, name, newYaml),
    onSuccess: (_res, newYaml) => {
      setYaml(newYaml);
      qc.invalidateQueries({ queryKey: queryKeys.deploymentYaml(ns, name) });
      qc.invalidateQueries({ queryKey: queryKeys.deploymentPods(ns, name) });
      qc.invalidateQueries({ queryKey: queryKeys.workloads });
      router.refresh();
      alert(t("alert.deploy.updated"));
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.deploy.update"));
    },
  });

  function handleSaveContainerEdit() {
    if (!selectedContainer) return;
    const containers = extractContainersFromYaml(yaml);
    const idx = containers.findIndex(c => c.name === selectedContainer);
    if (idx < 0) {
      alert(t("error.cont.notFound"));
      return;
    }
    const next = containers.slice();
    next[idx] = { ...next[idx], image: editImage };
    const newYaml = replaceContainersInYaml(yaml, next);
    applyYamlMut.mutate(newYaml);
    setIsEditOpen(false);
  }

  function handleDeleteContainer() {
    if (!selectedContainer) return;
    const containers = extractContainersFromYaml(yaml);
    if (containers.length <= 1) {
      alert(t("error.cont.onlyOne"));
      return;
    }
    if (!confirm(t("confirm.cont.delete", { name: selectedContainer }))) return;
    const next = containers.filter(c => c.name !== selectedContainer);
    const newYaml = replaceContainersInYaml(yaml, next);
    // Switch selection to first remaining container to keep UI valid
    const nextName = next[0]?.name ?? "";
    setSelectedContainer(nextName);
    applyYamlMut.mutate(newYaml);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("deploy.header.eyebrow")}
        title={`${name}`}
        description={t("deploy.header.desc", { ns })}
        actions={
          <div className="flex items-center gap-2">
            <Link className="underline text-text-muted" href="/workloads">{t("deploy.header.back")}</Link>
          </div>
        }
        meta={
          deployment ? (
            <>
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>{t("deploy.meta.replicas")}</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{deployment.replicas_ready ?? 0}/{deployment.replicas_desired ?? 0}</p>
                <p className="text-xs text-text-muted">{t("deploy.meta.readyDesired")}</p>
              </div>
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>{t("deploy.meta.status")}</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{deployment.status}</p>
                <p className="text-xs text-text-muted">{t("deploy.meta.health")}</p>
              </div>
            </>
          ) : null
        }
      />

      {/* Management actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("deploy.manage.title")}</CardTitle>
          <CardDescription>{t("deploy.manage.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => restartMut.mutate()} disabled={restartMut.isPending}>{t("deploy.manage.restart")}</Button>

          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">{t("deploy.meta.replicas")}</label>
            <input
              type="number"
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
              value={replicasInput === "" ? "" : replicasInput}
              onChange={(e) => setReplicasInput(e.target.value === "" ? "" : Number(e.target.value))}
              min={0}
            />
            <Button type="button" variant="outline" onClick={() => typeof replicasInput === "number" && scaleMut.mutate(replicasInput)} disabled={scaleMut.isPending}>
              {t("deploy.manage.apply")}
            </Button>
          </div>

          <Button type="button" variant="destructive" onClick={() => { if (confirm(t("deploy.manage.deleteConfirm"))) delMut.mutate(); }} disabled={delMut.isPending}>
            {t("deploy.manage.delete")}
          </Button>
        </CardContent>
      </Card>

      {/* YAML editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("deploy.yaml.title")}</CardTitle>
          <CardDescription>{t("deploy.yaml.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[220px] rounded-md border border-border bg-background p-2 font-mono text-xs text-text-primary"
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => yamlMut.mutate()} disabled={yamlMut.isPending}>{t("deploy.yaml.save")}</Button>
            <span className="text-xs text-text-muted">{t("deploy.yaml.note")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Container details */}
      <Card className="relative overflow-hidden border-border bg-surface">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-text-primary">{t("deploy.cont.title")}</CardTitle>
              <CardDescription>{t("deploy.cont.desc")}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Pod select */}
              <label className="text-xs text-text-muted">{t("deploy.cont.pod")}</label>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                value={selectedPod}
                onChange={(e) => setSelectedPod(e.target.value)}
              >
                {(pods ?? []).map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>

              {/* Container select */}
              <label className="text-xs text-text-muted">{t("deploy.cont.container")}</label>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                value={selectedContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
              >
                {containersForSelectedPod.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Container actions */}
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(v => !v)} disabled={!selectedContainer}>
                {isEditOpen ? t("deploy.cont.closeEdit") : t("deploy.cont.edit")}
              </Button>
              <Button type="button" variant="destructive" onClick={handleDeleteContainer} disabled={!selectedContainer}>
                {t("deploy.cont.delete")}
              </Button>

              {/* Time window */}
              {metricsStatus?.healthy ? (
                <>
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
                </>
              ) : (
                <span className="text-xs text-text-muted">{t("deploy.cont.metricsUnavailable")}</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {isEditOpen && selectedContainer && (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 text-sm font-medium text-text-primary">{t("deploy.cont.editing", { name: selectedContainer })}</div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted w-20">{t("deploy.cont.image")}</label>
                <input
                  className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                  placeholder={t("deploy.cont.image.placeholder")}
                  value={editImage}
                  onChange={(e) => setEditImage(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={handleSaveContainerEdit} disabled={!editImage.trim()}>
                  {t("deploy.cont.save")}
                </Button>
              </div>
              <div className="mt-1 text-xs text-text-muted">{t("deploy.cont.editHint")}</div>
            </div>
          )}
          {!series || !selectedContainer ? (
            <div className="py-8 text-center text-sm text-text-muted">{t("deploy.cont.selectPrompt")}</div>
          ) : series.points.length === 0 ? (
            <div className="py-4 text-sm text-text-muted">{t("deploy.cont.noMetrics", { name: selectedContainer })}</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>{selectedContainer}</Badge>
              </div>
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
    </div>
  );
}
