"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useI18n } from "@/shared/i18n/i18n";
import { fetchNodes, queryKeys, type NodeSummaryResponse } from "@/lib/api";

export default function NodesPage() {
  const { t } = useI18n();
  const { data: nodes, isLoading, isError } = useQuery({
    queryKey: queryKeys.nodes,
    queryFn: fetchNodes,
  });

  const { totalNodes, readyNodes, masters, workers } = useMemo(() => {
    const list: NodeSummaryResponse[] = nodes ?? [];
    const total = list.length;
    const ready = list.filter((n) => n.status === "Ready").length;
    const masterNodes = list.filter((n) =>
      (n.roles || []).some((r) => r === "master" || r === "control-plane")
    );
    const workerNodes = list.filter((n) =>
      !(n.roles || []).some((r) => r === "master" || r === "control-plane")
    );
    return {
      totalNodes: total,
      readyNodes: ready,
      masters: {
        total: masterNodes.length,
        ready: masterNodes.filter((n) => n.status === "Ready").length,
      },
      workers: {
        total: workerNodes.length,
        ready: workerNodes.filter((n) => n.status === "Ready").length,
      },
    };
  }, [nodes]);

  const spotInstances = 0; // No signal yet

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("nodes.eyebrow")}
        title={t("nodes.title")}
        description={t("nodes.desc")}
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("nodes.meta.ready")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{readyNodes}</p>
              <p className="text-xs text-text-muted">{t("nodes.meta.ready.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("nodes.meta.spot")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{spotInstances}</p>
              <p className="text-xs text-text-muted">{t("nodes.meta.spot.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("nodes.meta.total")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{totalNodes}</p>
              <p className="text-xs text-text-muted">{t("nodes.meta.total.help")}</p>
            </div>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Control plane (master) status */}
        <Card className="relative overflow-hidden">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base text-text-primary">{t("nodes.section.masters")}</CardTitle>
                <CardDescription>
                  {masters.total > 0
                    ? `${masters.ready}/${masters.total} ${t("status.ready")}`
                    : t("nodes.empty.title")}
                </CardDescription>
              </div>
              <StatusBadge
                status={masters.total === 0
                  ? "unknown"
                  : masters.ready === masters.total
                    ? "healthy"
                    : masters.ready > 0
                      ? "warning"
                      : "failed"}
                label={masters.total > 0
                  ? `${masters.ready}/${masters.total} ${t("status.ready")}`
                  : t("common.unknown")}
                size="sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-text-muted">{t("common.loading")}</p>
            ) : isError ? (
              <p className="text-sm text-text-muted">{t("workloads.error.load")}</p>
            ) : masters.total === 0 ? (
              <div className="text-sm text-text-muted">{t("nodes.empty.desc")}</div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="success-light" size="sm" className={badgePresets.metric}>
                  {t("status.ready")}: {masters.ready}
                </Badge>
                <Badge variant="error-light" size="sm" className={badgePresets.metric}>
                  {t("status.unhealthy")}: {masters.total - masters.ready}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Worker status */}
        <Card className="relative overflow-hidden">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base text-text-primary">{t("nodes.section.workers")}</CardTitle>
                <CardDescription>
                  {workers.total > 0
                    ? `${workers.ready}/${workers.total} ${t("status.ready")}`
                    : t("nodes.empty.title")}
                </CardDescription>
              </div>
              <StatusBadge
                status={workers.total === 0
                  ? "unknown"
                  : workers.ready === workers.total
                    ? "healthy"
                    : workers.ready > 0
                      ? "warning"
                      : "failed"}
                label={workers.total > 0
                  ? `${workers.ready}/${workers.total} ${t("status.ready")}`
                  : t("common.unknown")}
                size="sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-text-muted">{t("common.loading")}</p>
            ) : isError ? (
              <p className="text-sm text-text-muted">{t("workloads.error.load")}</p>
            ) : workers.total === 0 ? (
              <div className="text-sm text-text-muted">{t("nodes.empty.desc")}</div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="success-light" size="sm" className={badgePresets.metric}>
                  {t("status.ready")}: {workers.ready}
                </Badge>
                <Badge variant="error-light" size="sm" className={badgePresets.metric}>
                  {t("status.unhealthy")}: {workers.total - workers.ready}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nodes list */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base text-text-primary">{t("nodes.list.title")}</CardTitle>
          <CardDescription>{t("nodes.list.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-text-muted">{t("common.loading")}</p>
          ) : isError ? (
            <p className="text-sm text-text-muted">{t("workloads.error.load")}</p>
          ) : !nodes || nodes.length === 0 ? (
            <div className="text-sm text-text-muted">{t("nodes.empty.desc")}</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {nodes.map((n) => (
                <a key={n.name} href={`/nodes/${encodeURIComponent(n.name)}`} className="block rounded-md border border-border bg-surface p-3 hover:border-accent/60 transition">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-text-primary truncate" title={n.name}>{n.name}</div>
                    <StatusBadge status={n.status === "Ready" ? "ready" : n.status === "NotReady" ? "not-ready" : "unknown"} label={n.status} size="sm" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {(n.roles || []).map((r) => (
                      <Badge key={r} variant="neutral-light" size="sm" className={badgePresets.metric}>{r}</Badge>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                    <span>CPU {n.cpu_allocatable}</span>
                    <span>•</span>
                    <span>Mem {n.memory_allocatable}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

