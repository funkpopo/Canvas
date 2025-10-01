"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { SimpleLineChart } from "@/shared/ui/line-chart";
import { formatBytes, formatMillicores } from "@/lib/utils";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { useI18n } from "@/shared/i18n/i18n";
import { useDeploymentUpdates } from "@/hooks/useDeploymentUpdates";
import {
  fetchDeploymentPods,
  fetchWorkloads,
  fetchPodDetail,
  fetchContainerSeries,
  fetchMetricsStatus,
  fetchDeploymentYaml,
  updateDeploymentYaml,
  updateDeploymentImage,
  fetchDeploymentStrategy,
  updateDeploymentStrategy,
  fetchDeploymentAutoscaling,
  updateDeploymentAutoscaling,
  restartDeployment,
  scaleDeployment,
  deleteDeployment,
  queryKeys,
  type ContainerMetricSeriesResponse,
  type PodWithContainersResponse,
  type PodDetailResponse,
  type WorkloadSummaryResponse,
  type DeploymentStrategyResponse,
  type AutoscalingConfigResponse,
  type HPAMetricResponse,
  type HPATargetType,
} from "@/lib/api";

export default function DeploymentDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.namespace);
  const name = decodeURIComponent(params.name);
  const qc = useQueryClient();

  // Enable real-time updates via WebSocket
  useDeploymentUpdates();

  // Workloads query - no need for polling anymore, WebSocket handles updates
  const workloadsQuery = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });
  const workloads = workloadsQuery.data;
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
  const [multiSelect, setMultiSelect] = useState<boolean>(false);
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);

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

  // Default/validate selectedContainer when containers change
  useEffect(() => {
    if (containersForSelectedPod.length === 0) {
      setSelectedContainer("");
      setSelectedForDelete([]);
      return;
    }
    if (!selectedContainer || !containersForSelectedPod.includes(selectedContainer)) {
      setSelectedContainer(containersForSelectedPod[0]);
    }
  }, [containersForSelectedPod, selectedContainer]);

  function toggleSelectedForDelete(c: string) {
    setSelectedForDelete((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function handleDeleteContainers(targets: string[]) {
    // Use actual pod containers instead of yaml parsing for more reliable validation
    if (!yaml || !containersForSelectedPod || containersForSelectedPod.length === 0) {
      alert(t("error.cont.notFound"));
      return;
    }
    const uniqueTargets = Array.from(new Set(targets));
    const remainingCount = containersForSelectedPod.length - uniqueTargets.length;
    if (containersForSelectedPod.length <= 1 || remainingCount < 1) {
      alert(t("error.cont.onlyOne"));
      return;
    }
    const containers = extractContainersFromYaml(yaml);
    const next = containers.filter((c) => !uniqueTargets.includes(c.name));
    const names = uniqueTargets.join(", ");
    if (!confirm(t("confirm.cont.deleteMany", { names }))) return;
    const newYaml = replaceContainersInYaml(yaml, next);
    updateDeploymentYaml(ns, name, newYaml)
      .then(() => {
        setYaml(newYaml);
        setSelectedForDelete([]);
        setMultiSelect(false);
        qc.invalidateQueries({ queryKey: queryKeys.deploymentYaml(ns, name) });
        qc.invalidateQueries({ queryKey: queryKeys.deploymentPods(ns, name) });
        qc.invalidateQueries({ queryKey: queryKeys.workloads });
        router.refresh();
        alert(t("alert.deploy.updated"));
      })
      .catch((e: any) => alert(e?.message || t("error.deploy.update")));
  }

  // Container metrics for selected container
  const containerQueryEnabled = Boolean(selectedPod && selectedContainer);
  const { data: series } = useQuery<ContainerMetricSeriesResponse>({
    queryKey: queryKeys.containerSeries(ns, selectedPod, selectedContainer, window),
    queryFn: () => fetchContainerSeries(ns, selectedPod, selectedContainer, window),
    enabled: containerQueryEnabled,
    staleTime: 10_000,
  });

  // Pod detail for container readiness state
  const { data: podDetail } = useQuery({
    queryKey: queryKeys.podDetail(ns, selectedPod || "__none__"),
    queryFn: () => fetchPodDetail(ns, selectedPod),
    enabled: Boolean(selectedPod),
    staleTime: 10_000,
  });

  // Prefer readiness info from deployment pods API to avoid extra calls
  const podsIncludeReadiness = useMemo(
    () => (pods ?? []).some((p: any) => 'ready_containers' in p || 'total_containers' in p || 'phase' in p),
    [pods]
  );

  // Pod details for readiness coloring on the left list (fallback when not included in pods API)
  const podDetailsQueries = useQueries({
    queries: (pods ?? []).map((p) => ({
      queryKey: queryKeys.podDetail(ns, p.name),
      queryFn: () => fetchPodDetail(ns, p.name),
      enabled: Boolean(pods && pods.length > 0 && !podsIncludeReadiness),
      staleTime: 10_000,
    })),
  });
  const podReadiness = useMemo(() => {
    const map: Record<string, { ready: number; total: number }> = {};
    if (podsIncludeReadiness) {
      (pods ?? []).forEach((p: any) => {
        const total = (p.total_containers ?? p.containers?.length ?? 0) as number;
        const ready = (p.ready_containers ?? 0) as number;
        map[p.name] = { ready, total };
      });
      return map;
    }
    (pods ?? []).forEach((p, idx) => {
      const d = podDetailsQueries[idx]?.data as (PodDetailResponse | undefined);
      const total = d?.containers?.length ?? (p.containers?.length ?? 0);
      const ready = d?.containers?.filter((c: any) => c.ready)?.length ?? 0;
      map[p.name] = { ready, total };
    });
    return map;
  }, [pods, podDetailsQueries, podsIncludeReadiness]);

  const podPhaseByName = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    if (podsIncludeReadiness) {
      (pods ?? []).forEach((p: any) => { map[p.name] = p.phase as string | undefined; });
    }
    return map;
  }, [pods, podsIncludeReadiness]);

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
      // WebSocket will handle real-time updates, no need for polling
      qc.invalidateQueries({ queryKey: queryKeys.deploymentPods(ns, name) });
      qc.invalidateQueries({ queryKey: queryKeys.deploymentYaml(ns, name) });
    },
    onError: (_e: unknown) => {
      // Suppress browser alerts for replica changes per requirements
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
  const [isYamlOpen, setIsYamlOpen] = useState(false);

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

  const [editOpenFor, setEditOpenFor] = useState<string | null>(null);
  const [editImage, setEditImage] = useState("");

  function openEditFor(containerName: string) {
    try {
      const obj = parseYaml(yaml) as K8sDeployment;
      const c = obj?.spec?.template?.spec?.containers?.find((x) => x.name === containerName);
      setEditImage(c?.image ?? "");
    } catch {
      setEditImage("");
    }
    setEditOpenFor(containerName);
  }

  const updateImageMut = useMutation({
    mutationFn: (img: string) => updateDeploymentImage(ns, name, { container: editOpenFor || "", image: img }),
    onSuccess: () => {
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
    if (!editOpenFor) return;
    const containers = extractContainersFromYaml(yaml);
    const idx = containers.findIndex((c) => c.name === editOpenFor);
    if (idx < 0) {
      alert(t("error.cont.notFound"));
      return;
    }
    updateImageMut.mutate(editImage.trim());
    setEditOpenFor(null);
  }

  // Strategy & autoscaling editor
  const [isStrategyOpen, setIsStrategyOpen] = useState(false);
  const { data: strategy } = useQuery<DeploymentStrategyResponse>({
    queryKey: queryKeys.strategy(ns, name),
    queryFn: () => fetchDeploymentStrategy(ns, name),
    enabled: isStrategyOpen,
  });
  const { data: hpa } = useQuery<AutoscalingConfigResponse>({
    queryKey: queryKeys.hpa(ns, name),
    queryFn: () => fetchDeploymentAutoscaling(ns, name),
    enabled: isStrategyOpen,
  });
  const [sType, setSType] = useState<"RollingUpdate" | "Recreate">("RollingUpdate");
  const [maxUnavailable, setMaxUnavailable] = useState<string | number | "">("");
  const [maxSurge, setMaxSurge] = useState<string | number | "">("");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [minReplicas, setMinReplicas] = useState<number | "">("");
  const [maxReplicas, setMaxReplicas] = useState<number | "">("");
  const [targetCpu, setTargetCpu] = useState<number | "">("");
  const [useAdvancedMetrics, setUseAdvancedMetrics] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<HPAMetricResponse[]>([]);

  useEffect(() => {
    if (strategy) {
      setSType(strategy.strategy_type);
      setMaxUnavailable(strategy.max_unavailable ?? "");
      setMaxSurge(strategy.max_surge ?? "");
    }
  }, [strategy]);
  useEffect(() => {
    if (hpa) {
      setAutoEnabled(Boolean(hpa.enabled));
      setMinReplicas(hpa.min_replicas ?? "");
      setMaxReplicas(hpa.max_replicas ?? "");
      setTargetCpu(hpa.target_cpu_utilization ?? "");
      const ms = hpa.metrics ?? [];
      setMetrics(ms);
      setUseAdvancedMetrics((ms?.length ?? 0) > 0);
    }
  }, [hpa]);

  const saveStrategyMut = useMutation({
    mutationFn: async () => {
      // Save strategy then autoscaling
      await updateDeploymentStrategy(ns, name, {
        strategy_type: sType,
        max_unavailable: sType === "RollingUpdate" ? (maxUnavailable === "" ? null : maxUnavailable) : null,
        max_surge: sType === "RollingUpdate" ? (maxSurge === "" ? null : maxSurge) : null,
      });
      await updateDeploymentAutoscaling(ns, name, {
        enabled: autoEnabled,
        min_replicas: autoEnabled ? (minReplicas === "" ? 1 : Number(minReplicas)) : null,
        max_replicas: autoEnabled ? (maxReplicas === "" ? 3 : Number(maxReplicas)) : null,
        target_cpu_utilization: autoEnabled && !useAdvancedMetrics ? (targetCpu === "" ? 80 : Number(targetCpu)) : null,
        metrics: autoEnabled && useAdvancedMetrics ? metrics : [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.strategy(ns, name) });
      qc.invalidateQueries({ queryKey: queryKeys.hpa(ns, name) });
      qc.invalidateQueries({ queryKey: queryKeys.workloads });
      setIsStrategyOpen(false);
      alert(t("alert.deploy.strategyUpdated"));
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.deploy.strategyUpdate"));
    },
  });

  // HPA advanced metrics helpers
  function addMetric(mt: 'Resource' | 'Pods' | 'External') {
    let m: HPAMetricResponse;
    if (mt === 'Resource') {
      m = { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', average_utilization: 80 } } } as HPAMetricResponse;
    } else if (mt === 'Pods') {
      m = { type: 'Pods', pods: { metric_name: '', target: { type: 'AverageValue', average_value: '1' } } } as HPAMetricResponse;
    } else {
      m = { type: 'External', external: { metric_name: '', selector: {}, target: { type: 'AverageValue', average_value: '1' } } } as HPAMetricResponse;
    }
    setMetrics((prev) => [...prev, m]);
  }
  function removeMetric(idx: number) {
    setMetrics((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateMetricType(idx: number, newType: 'Resource' | 'Pods' | 'External') {
    const next = [...metrics];
    next[idx] = (newType === 'Resource')
      ? { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', average_utilization: 80 } } }
      : (newType === 'Pods')
        ? { type: 'Pods', pods: { metric_name: '', target: { type: 'AverageValue', average_value: '1' } } }
        : { type: 'External', external: { metric_name: '', selector: {}, target: { type: 'AverageValue', average_value: '1' } } };
    setMetrics(next as HPAMetricResponse[]);
  }
  function updateResourceMetric(idx: number, patch: Partial<{ name: string; target_type: HPATargetType; avg_util?: number; avg_val?: string; val?: string }>) {
    const next = [...metrics] as HPAMetricResponse[];
    const m = next[idx];
    if (!m || m.type !== 'Resource') return;
    const current = m.resource;
    const targetType = patch.target_type ?? current.target.type;
    const target: any = { type: targetType };
    if (targetType === 'Utilization') target.average_utilization = patch.avg_util ?? current.target.average_utilization ?? 80;
    if (targetType === 'AverageValue') target.average_value = patch.avg_val ?? current.target.average_value ?? '1';
    if (targetType === 'Value') target.value = patch.val ?? current.target.value ?? '1';
    m.resource = { name: patch.name ?? current.name, target } as any;
    setMetrics(next);
  }
  function updatePodsMetric(idx: number, patch: Partial<{ metric_name: string; target_type: HPATargetType; avg_val?: string; val?: string }>) {
    const next = [...metrics] as HPAMetricResponse[];
    const m = next[idx];
    if (!m || m.type !== 'Pods') return;
    const current = m.pods;
    const targetType = patch.target_type ?? current.target.type;
    const target: any = { type: targetType };
    if (targetType === 'AverageValue') target.average_value = patch.avg_val ?? current.target.average_value ?? '1';
    if (targetType === 'Value') target.value = patch.val ?? current.target.value ?? '1';
    m.pods = { metric_name: patch.metric_name ?? current.metric_name, target } as any;
    setMetrics(next);
  }
  function updateExternalMetric(idx: number, patch: Partial<{ metric_name: string; selector_text: string; target_type: HPATargetType; avg_val?: string; val?: string }>) {
    const next = [...metrics] as HPAMetricResponse[];
    const m = next[idx];
    if (!m || m.type !== 'External') return;
    const current = m.external;
    const targetType = patch.target_type ?? current.target.type;
    const target: any = { type: targetType };
    if (targetType === 'AverageValue') target.average_value = patch.avg_val ?? current.target.average_value ?? '1';
    if (targetType === 'Value') target.value = patch.val ?? current.target.value ?? '1';
    let selector: Record<string, string> | undefined = current.selector || undefined;
    if (typeof patch.selector_text === 'string') {
      const text = patch.selector_text.trim();
      if (text === '') selector = undefined;
      else {
        selector = {};
        text.split(',').forEach((kv) => {
          const [k, v] = kv.split('=');
          if (k && v) selector![k.trim()] = v.trim();
        });
      }
    }
    m.external = { metric_name: patch.metric_name ?? current.metric_name, selector, target } as any;
    setMetrics(next);
  }

  function handleDeleteContainer(target: string) {
    // Use actual pod containers instead of yaml parsing for more reliable validation
    if (!yaml || !containersForSelectedPod || containersForSelectedPod.length <= 1) {
      alert(t("error.cont.onlyOne"));
      return;
    }
    if (!confirm(t("confirm.cont.delete", { name: target }))) return;
    const containers = extractContainersFromYaml(yaml);
    const next = containers.filter((c) => c.name !== target);
    const newYaml = replaceContainersInYaml(yaml, next);
    updateDeploymentYaml(ns, name, newYaml)
      .then(() => {
        setYaml(newYaml);
        qc.invalidateQueries({ queryKey: queryKeys.deploymentYaml(ns, name) });
        qc.invalidateQueries({ queryKey: queryKeys.deploymentPods(ns, name) });
        qc.invalidateQueries({ queryKey: queryKeys.workloads });
        router.refresh();
        alert(t("alert.deploy.updated"));
      })
      .catch((e: any) => alert(e?.message || t("error.deploy.update")));
  }

  // Derived status to reduce perceived delay after scaling
  const displayStatus = useMemo(() => {
    if (!deployment) return "";
    const ready = deployment.replicas_ready ?? 0;
    const desired = deployment.replicas_desired ?? 0;
    if (scaleMut.isPending || ready !== desired) return t("status.pending");
    return deployment.status;
  }, [deployment, scaleMut.isPending, t]);

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
                <p className="mt-1 text-lg font-semibold text-text-primary">{displayStatus}</p>
                <p className="text-xs text-text-muted">{t("deploy.meta.health")}</p>
              </div>
            </>
          ) : null
        }
      >
      </PageHeader>

      {/* Management actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("deploy.manage.title")}</CardTitle>
          <CardDescription>{t("deploy.manage.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => restartMut.mutate()} disabled={restartMut.isPending}>{t("deploy.manage.restart")}</Button>

          <Button type="button" variant="outline" onClick={() => setIsYamlOpen(true)}>{t("deploy.yaml.edit")}</Button>

          <Button type="button" variant="outline" onClick={() => setIsStrategyOpen(true)}>{t("deploy.strategy.edit")}</Button>

          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">{t("deploy.meta.replicas")}</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scaleMut.isPending || (typeof replicasInput === "number" && replicasInput <= 0)}
              onClick={() => {
                const prev = typeof replicasInput === "number" ? replicasInput : 0;
                const next = Math.max(0, prev - 1);
                setReplicasInput(next);
                scaleMut.mutate(next, { onError: () => setReplicasInput(prev) });
              }}
            >
              -
            </Button>
            <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
              {replicasInput === "" ? 0 : replicasInput}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scaleMut.isPending}
              onClick={() => {
                const prev = typeof replicasInput === "number" ? replicasInput : 0;
                const next = prev + 1;
                setReplicasInput(next);
                scaleMut.mutate(next, { onError: () => setReplicasInput(prev) });
              }}
            >
              +
            </Button>
          </div>

          <Button type="button" variant="destructive" onClick={() => { if (confirm(t("deploy.manage.deleteConfirm"))) delMut.mutate(); }} disabled={delMut.isPending}>
            {t("deploy.manage.delete")}
          </Button>
        </CardContent>
      </Card>

      <Modal
        open={isStrategyOpen}
        onClose={() => setIsStrategyOpen(false)}
        title={t("deploy.strategy.edit")}
        description={t("deploy.header.desc", { ns })}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs text-text-muted">{t("deploy.strategy.type")}</label>
            <select className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary" value={sType} onChange={(e) => setSType(e.target.value as any)}>
              <option value="RollingUpdate">{t("deploy.strategy.rolling")}</option>
              <option value="Recreate">{t("deploy.strategy.recreate")}</option>
            </select>
          </div>
          {sType === "RollingUpdate" && (
            <>
              <div className="space-y-2">
                <label className="text-xs text-text-muted">{t("deploy.strategy.maxUnavailable")}</label>
                <input className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary" value={maxUnavailable as any} onChange={(e) => setMaxUnavailable(e.target.value)} placeholder="25% or 1" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-text-muted">{t("deploy.strategy.maxSurge")}</label>
                <input className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary" value={maxSurge as any} onChange={(e) => setMaxSurge(e.target.value)} placeholder="25% or 1" />
              </div>
            </>
          )}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 text-sm font-medium text-text-primary">{t("deploy.autoscaling.title")}</div>
          <div className="flex items-center gap-2">
            <input id="hpa_toggle" type="checkbox" checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} />
            <label htmlFor="hpa_toggle" className="text-sm text-text-primary">{t("deploy.autoscaling.enable")}</label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t("deploy.autoscaling.min")}</label>
              <input type="number" min={1} className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary" value={minReplicas as any} onChange={(e) => setMinReplicas(e.target.value === "" ? "" : Number(e.target.value))} disabled={!autoEnabled} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t("deploy.autoscaling.max")}</label>
              <input type="number" min={1} className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary" value={maxReplicas as any} onChange={(e) => setMaxReplicas(e.target.value === "" ? "" : Number(e.target.value))} disabled={!autoEnabled} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t("deploy.autoscaling.advanced")}</label>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={useAdvancedMetrics} onChange={(e) => setUseAdvancedMetrics(e.target.checked)} disabled={!autoEnabled} />
                <span className="text-xs text-text-muted">{t("deploy.autoscaling.advancedHint")}</span>
              </div>
            </div>
          </div>

          {!useAdvancedMetrics ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">{t("deploy.autoscaling.cpu")}</label>
                <input type="number" min={1} max={100} className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary" value={targetCpu as any} onChange={(e) => setTargetCpu(e.target.value === "" ? "" : Number(e.target.value))} disabled={!autoEnabled} />
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {metrics.map((m, idx) => (
                <div key={idx} className="rounded border border-border bg-background p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-text-muted">{t("deploy.autoscaling.metric.type")}</label>
                      <select
                        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                        value={m.type}
                        onChange={(e) => updateMetricType(idx, e.target.value as any)}
                        disabled={!autoEnabled}
                      >
                        <option value="Resource">{t("deploy.autoscaling.metric.resource")}</option>
                        <option value="Pods">{t("deploy.autoscaling.metric.pods")}</option>
                        <option value="External">{t("deploy.autoscaling.metric.external")}</option>
                      </select>
                    </div>
                    <Button type="button" variant="destructive" onClick={() => removeMetric(idx)} disabled={!autoEnabled}>{t("deploy.autoscaling.remove")}</Button>
                  </div>

                  {m.type === 'Resource' && (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">{t("deploy.autoscaling.resource.name")}</label>
                        <select
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                          value={(m as any).resource?.name ?? 'cpu'}
                          onChange={(e) => updateResourceMetric(idx, { name: e.target.value })}
                          disabled={!autoEnabled}
                        >
                          <option value="cpu">cpu</option>
                          <option value="memory">memory</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.type")}</label>
                        <select
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                          value={(m as any).resource?.target?.type ?? 'Utilization'}
                          onChange={(e) => updateResourceMetric(idx, { target_type: e.target.value as HPATargetType })}
                          disabled={!autoEnabled}
                        >
                          <option value="Utilization">{t("deploy.autoscaling.target.utilization")}</option>
                          <option value="AverageValue">{t("deploy.autoscaling.target.averageValue")}</option>
                          <option value="Value">{t("deploy.autoscaling.target.value")}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        {((m as any).resource?.target?.type ?? 'Utilization') === 'Utilization' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.utilization")}</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).resource?.target?.average_utilization ?? 80}
                              onChange={(e) => updateResourceMetric(idx, { avg_util: Number(e.target.value) })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                        {((m as any).resource?.target?.type ?? '') === 'AverageValue' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.averageValue")}</label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).resource?.target?.average_value ?? ''}
                              onChange={(e) => updateResourceMetric(idx, { avg_val: e.target.value })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                        {((m as any).resource?.target?.type ?? '') === 'Value' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.value")}</label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).resource?.target?.value ?? ''}
                              onChange={(e) => updateResourceMetric(idx, { val: e.target.value })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {m.type === 'Pods' && (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">{t("deploy.autoscaling.pods.metricName")}</label>
                        <input
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                          value={(m as any).pods?.metric_name ?? ''}
                          onChange={(e) => updatePodsMetric(idx, { metric_name: e.target.value })}
                          disabled={!autoEnabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.type")}</label>
                        <select
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                          value={(m as any).pods?.target?.type ?? 'AverageValue'}
                          onChange={(e) => updatePodsMetric(idx, { target_type: e.target.value as HPATargetType })}
                          disabled={!autoEnabled}
                        >
                          <option value="AverageValue">{t("deploy.autoscaling.target.averageValue")}</option>
                          <option value="Value">{t("deploy.autoscaling.target.value")}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        {((m as any).pods?.target?.type ?? 'AverageValue') === 'AverageValue' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.averageValue")}</label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).pods?.target?.average_value ?? ''}
                              onChange={(e) => updatePodsMetric(idx, { avg_val: e.target.value })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                        {((m as any).pods?.target?.type ?? '') === 'Value' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.value")}</label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).pods?.target?.value ?? ''}
                              onChange={(e) => updatePodsMetric(idx, { val: e.target.value })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {m.type === 'External' && (
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">{t("deploy.autoscaling.external.metricName")}</label>
                        <input
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                          value={(m as any).external?.metric_name ?? ''}
                          onChange={(e) => updateExternalMetric(idx, { metric_name: e.target.value })}
                          disabled={!autoEnabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">selector</label>
                        <input
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                          placeholder="key1=value1,key2=value2"
                          value={Object.entries((m as any).external?.selector ?? {}).map(([k,v]) => `${k}=${v}`).join(',')}
                          onChange={(e) => updateExternalMetric(idx, { selector_text: e.target.value })}
                          disabled={!autoEnabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.type")}</label>
                        <select
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                          value={(m as any).external?.target?.type ?? 'AverageValue'}
                          onChange={(e) => updateExternalMetric(idx, { target_type: e.target.value as HPATargetType })}
                          disabled={!autoEnabled}
                        >
                          <option value="AverageValue">{t("deploy.autoscaling.target.averageValue")}</option>
                          <option value="Value">{t("deploy.autoscaling.target.value")}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        {((m as any).external?.target?.type ?? 'AverageValue') === 'AverageValue' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.averageValue")}</label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).external?.target?.average_value ?? ''}
                              onChange={(e) => updateExternalMetric(idx, { avg_val: e.target.value })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                        {((m as any).external?.target?.type ?? '') === 'Value' && (
                          <>
                            <label className="text-xs text-text-muted">{t("deploy.autoscaling.target.value")}</label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
                              value={(m as any).external?.target?.value ?? ''}
                              onChange={(e) => updateExternalMetric(idx, { val: e.target.value })}
                              disabled={!autoEnabled}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => addMetric('Resource')} disabled={!autoEnabled}>{t("deploy.autoscaling.metric.resource")}</Button>
                <Button type="button" variant="outline" onClick={() => addMetric('Pods')} disabled={!autoEnabled}>{t("deploy.autoscaling.metric.pods")}</Button>
                <Button type="button" variant="outline" onClick={() => addMetric('External')} disabled={!autoEnabled}>{t("deploy.autoscaling.metric.external")}</Button>
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsStrategyOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="button" onClick={() => saveStrategyMut.mutate()}>{t("deploy.strategy.save")}</Button>
          </div>
        </div>
      </Modal>

      {/* YAML editor modal */}
      <Modal
        open={isYamlOpen}
        onClose={() => setIsYamlOpen(false)}
        title={t("deploy.yaml.title")}
        description={t("deploy.yaml.desc")}
      >
        <div className="space-y-2">
          <textarea
            className="w-full min-h-[240px] rounded-md border border-border bg-background p-2 font-mono text-xs text-text-primary"
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsYamlOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="button" onClick={() => yamlMut.mutate()} disabled={yamlMut.isPending}>{t("deploy.yaml.save")}</Button>
          </div>
          <div className="text-xs text-text-muted">{t("deploy.yaml.note")}</div>
        </div>
      </Modal>

      {/* Container details */}
      <Card className="relative overflow-hidden border-border bg-surface">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-text-primary">{t("deploy.cont.title")}</CardTitle>
              <CardDescription>{t("deploy.cont.desc")}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Pod list moved to left column; dropdown removed */}

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
        <CardContent>
          {!pods || (pods?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">{t("deploy.cont.selectPrompt")}</div>
          ) : (
            <div className="md:flex md:gap-6">
              {/* Left: pod list with scroll */}
              <div className="md:w-80 max-h-[60vh] overflow-y-auto pr-2 space-y-2">
                {(pods ?? []).map((p) => {
                  const rr = podReadiness[p.name] ?? { ready: 0, total: 0 };
                  const allReady = rr.total > 0 && rr.ready === rr.total;
                  const anyNotReady = rr.total > 0 && rr.ready < rr.total;
                  const selected = selectedPod === p.name;
                  
                  // Simplified color scheme with dark mode support
                  let colorCls = "bg-background border-border text-text-muted";
                  let statusIcon = "○";
                  let statusText = t("common.unknown");
                  const phase = podPhaseByName[p.name];
                  
                  if (allReady) {
                    colorCls = "bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400";
                    statusIcon = "✓";
                    statusText = t("status.ready");
                  } else if (anyNotReady) {
                    colorCls = "bg-rose-50/50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400";
                    statusIcon = "✕";
                    statusText = t("status.notReady");
                  }
                  
                  if (phase === 'Pending') {
                    colorCls = "bg-amber-50/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400";
                    statusText = t("status.pending");
                  }
                  const selCls = selected ? "border-blue-500 bg-blue-50/30" : "";
                    
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setSelectedPod(p.name)}
                      className={`
                        w-full rounded border px-3 py-2 text-left text-sm 
                        ${colorCls} ${selCls}
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{statusIcon}</span>
                            <span className="break-all whitespace-normal">{p.name}</span>
                          </div>
                          <div className="mt-1 text-xs opacity-70">
                            {rr.ready}/{rr.total} containers
                          </div>
                        </div>
                        <span className="text-xs whitespace-nowrap">
                          {statusText}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right: selected container details */}
              <div className="flex-1 mt-6 md:mt-0">
                {/* Container chips for selected pod */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {containersForSelectedPod.map((c) => {
                      const sel = selectedContainer === c;
                      const picked = selectedForDelete.includes(c);
                      
                      // Get container status from podDetail
                      const containerStatus = podDetail?.containers?.find((cs) => cs.name === c);
                      const isReady = containerStatus?.ready ?? null;
                      const restartCount = containerStatus?.restart_count ?? 0;
                      
                      // Simplified status styling with dark mode support
                      let statusColors = "bg-background text-text-primary border-border";
                      let statusIcon = "";
                      
                      if (isReady === true) {
                        statusColors = "bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
                        statusIcon = "✓";
                      } else if (isReady === false) {
                        if (restartCount > 0) {
                          statusColors = "bg-amber-50/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
                          statusIcon = `⟳${restartCount}`;
                        } else {
                          statusColors = "bg-rose-50/50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800";
                          statusIcon = "✕";
                        }
                      }
                      
                      // Ensure pending/waiting shows as warning
                      if (containerStatus?.state === 'Waiting' || (podDetail?.phase === 'Pending' && isReady === false)) {
                        statusColors = "bg-amber-50/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
                        statusIcon = "";
                      }

                      // Simplified selected state with dark mode
                      const selectedCls = sel ? "border-blue-500 dark:border-blue-400 bg-blue-50/30 dark:bg-blue-900/20 font-medium" : "";
                      const multiCls = picked ? "border-emerald-500 dark:border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/20" : "";
                      
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => (multiSelect ? toggleSelectedForDelete(c) : setSelectedContainer(c))}
                          className={`
                            ${statusColors}
                            ${selectedCls}
                            ${multiCls}
                            border rounded px-2.5 py-1 text-xs
                            ${multiSelect ? "relative" : ""}
                            inline-flex items-center gap-1
                          `}
                          title={`${c}${isReady === true ? ' (Ready)' : isReady === false ? ' (Not Ready)' : ' (Unknown)'}`}
                        >
                          {statusIcon && <span className="text-xs">{statusIcon}</span>}
                          <span>{c}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    {!multiSelect ? (
                      <>
                        <Button type="button" variant="outline" onClick={() => selectedContainer && openEditFor(selectedContainer)} disabled={!selectedContainer}>{t("deploy.cont.edit")}</Button>
                        <Button type="button" variant="destructive" onClick={() => selectedContainer && handleDeleteContainer(selectedContainer)} disabled={!selectedContainer}>{t("deploy.cont.delete")}</Button>
                        <Button type="button" variant="outline" onClick={() => { setMultiSelect(true); setSelectedForDelete([]); }}>{t("deploy.cont.multiSelect")}</Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="destructive" onClick={() => handleDeleteContainers(selectedForDelete)} disabled={selectedForDelete.length === 0}>{t("deploy.cont.deleteSelected")}</Button>
                        <Button type="button" variant="outline" onClick={() => { setMultiSelect(false); setSelectedForDelete([]); }}>{t("deploy.cont.cancelSelect")}</Button>
                      </>
                    )}
                  </div>
                </div>

                {editOpenFor === selectedContainer && (
                  <div className="mt-3 rounded border border-border bg-surface p-3">
                    <div className="mb-2 text-sm font-medium text-text-primary">
                      {t("deploy.cont.editing", { name: selectedContainer })}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-text-muted w-20">{t("deploy.cont.image")}</label>
                      <input
                        className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-blue-500 focus:outline-none"
                        placeholder={t("deploy.cont.image.placeholder")}
                        value={editImage}
                        onChange={(e) => setEditImage(e.target.value)}
                      />
                      <Button type="button" variant="outline" onClick={handleSaveContainerEdit} disabled={!editImage.trim()}>
                        {t("deploy.cont.save")}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditOpenFor(null)}>
                        {t("deploy.cont.closeEdit")}
                      </Button>
                    </div>
                    <div className="mt-1.5 text-xs text-text-muted">{t("deploy.cont.editHint")}</div>
                  </div>
                )}

                {!series || !selectedContainer ? (
                  <div className="py-8 text-center text-sm text-text-muted">{t("deploy.cont.selectPrompt")}</div>
                ) : series.points.length === 0 ? (
                  <div className="py-4 text-sm text-text-muted">{t("deploy.cont.noMetrics", { name: selectedContainer })}</div>
                ) : (
                  <div className="mt-4 grid gap-6 md:grid-cols-2">
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
