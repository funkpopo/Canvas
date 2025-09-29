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
  fetchPodsInNamespace,
  fetchWorkloads,
  queryKeys,
  type ContainerMetricSeriesResponse,
  type PodWithContainersResponse,
} from "@/lib/api";
import { SimpleLineChart } from "@/shared/ui/line-chart";
import { useI18n } from "@/shared/i18n/i18n";
import { formatBytes, formatMillicores } from "@/lib/utils";

export default function NamespaceDetailPage() {
  const { t } = useI18n();
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
        eyebrow={t("ns.header.eyebrow")}
        title={ns}
        description={t("ns.header.desc")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/namespaces")}>{t("ns.header.back")}</Button>
          </div>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("ns.meta.workloads")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{filtered.length}</p>
              <p className="text-xs text-text-muted">{t("ns.meta.kinds")}</p>
            </div>
          </>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-text-muted">{t("ns.loading")}</p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-text-muted">{t("ns.error")}</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-text-muted">{t("ns.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((workload) => {
            const card = (
              <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden hover:bg-hover transition-colors">
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
                    <span className="text-text-muted">{t("ns.field.replicas")}</span>
                    <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                      {workload.replicas_ready ?? 0}/{workload.replicas_desired ?? 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{t("ns.field.version")}</span>
                    <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                      {workload.version || t("ns.na")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );

            // Make Deployment cards clickable into manage page
            if (workload.kind === "Deployment") {
              return (
                <Link
                  key={`${workload.namespace}-${workload.name}`}
                  className="block cursor-pointer"
                  href={`/workloads/deployments/${encodeURIComponent(workload.namespace)}/${encodeURIComponent(workload.name)}`}
                >
                  {card}
                </Link>
              );
            }

            return card;
          })}
        </div>
      )}

      {/* Container details moved to deployment detail page */}
    </div>
  );
}
