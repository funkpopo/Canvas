"use client";

import Link from "next/link";
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
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { StatusBadge } from "@/shared/ui/status-badge";
import { queryKeys, fetchWorkloads } from "@/lib/api";
import { useI18n } from "@/shared/i18n/i18n";
import { useDeploymentUpdates } from "@/hooks/useDeploymentUpdates";

export default function WorkloadsPage() {
  const { t } = useI18n();
  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  // Enable real-time updates via WebSocket
  useDeploymentUpdates();

  const deployments = workloads?.filter((w) => w.kind === "Deployment") ?? [];
  const statefulsets = workloads?.filter((w) => w.kind === "StatefulSet") ?? [];
  const cronjobs = workloads?.filter((w) => w.kind === "CronJob") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("workloads.eyebrow")}
        title={t("workloads.title")}
        description={t("workloads.desc")}
        actions={
          <Button type="button" className="bg-gradient-to-r from-violet-400 to-fuchsia-500 text-slate-900 hover:from-violet-300 hover:to-fuchsia-400">
            {t("workloads.create")}
          </Button>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("workloads.meta.deployments")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{deployments.length}</p>
              <p className="text-xs text-text-muted">{t("workloads.meta.deployments.desc")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("workloads.meta.statefulsets")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{statefulsets.length}</p>
              <p className="text-xs text-text-muted">{t("workloads.meta.statefulsets.desc")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("workloads.meta.cronjobs")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{cronjobs.length}</p>
              <p className="text-xs text-text-muted">{t("workloads.meta.cronjobs.desc")}</p>
            </div>
          </>
        }
      >

      </PageHeader>

      <Tabs defaultValue="deployments" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deployments">{t("workloads.tab.deployments")}</TabsTrigger>
          <TabsTrigger value="statefulsets">{t("workloads.tab.statefulsets")}</TabsTrigger>
          <TabsTrigger value="cronjobs">{t("workloads.tab.cronjobs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">{t("workloads.loading.deployments")}</p>
              </CardContent>
            </Card>
          ) : isError ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">{t("workloads.error.load")}</p>
              </CardContent>
            </Card>
          ) : deployments.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <p className="text-text-muted">{t("workloads.empty.deployments")}</p>
                  <p className="text-xs text-text-muted">{t("workloads.empty.deployments.hint")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,300px)] justify-start">
              {deployments.map((workload) => (
                <Link
                  key={`${workload.namespace}-${workload.name}`}
                  href={`/workloads/deployments/${encodeURIComponent(workload.namespace)}/${encodeURIComponent(workload.name)}`}
                  className="block h-full"
                >
                  <Card className="relative overflow-hidden hover:bg-hover cursor-pointer transition-colors py-4 gap-4 h-full flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base text-text-primary truncate" title={workload.name}>{workload.name}</CardTitle>
                          <CardDescription className="truncate">{t("workloads.card.namespace", { ns: workload.namespace })}</CardDescription>
                        </div>
                        <StatusBadge
                          status={workload.status === "Healthy" ? "healthy" : "warning"}
                          label={workload.status}
                          size="sm"
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">{t("workloads.field.replicas")}</span>
                        <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                          {workload.replicas_ready ?? 0}/{workload.replicas_desired ?? 0}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">{t("workloads.field.version")}</span>
                        <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                          {workload.version || "N/A"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="statefulsets" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">{t("common.loading")}</p>
              </CardContent>
            </Card>
          ) : statefulsets.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <p className="text-text-muted">{t("workloads.empty.statefulsets")}</p>
                  <p className="text-xs text-text-muted">{t("workloads.empty.statefulsets.hint")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,300px)] justify-start">
              {statefulsets.map((workload) => (
                <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden py-4 gap-4 h-full flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base text-text-primary truncate" title={workload.name}>{workload.name}</CardTitle>
                        <CardDescription className="truncate">{t("workloads.card.namespace", { ns: workload.namespace })}</CardDescription>
                      </div>
                      <StatusBadge
                        status={workload.status === "Healthy" ? "healthy" : "warning"}
                        label={workload.status}
                        size="sm"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">{t("workloads.field.replicas")}</span>
                      <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                        {workload.replicas_ready ?? 0}/{workload.replicas_desired ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">{t("workloads.field.version")}</span>
                      <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                        {workload.version || "N/A"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cronjobs" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">{t("workloads.loading.cronjobs")}</p>
              </CardContent>
            </Card>
          ) : cronjobs.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <p className="text-text-muted">{t("workloads.empty.cronjobs")}</p>
                  <p className="text-xs text-text-muted">{t("workloads.empty.cronjobs.hint")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,300px)] justify-start">
              {cronjobs.map((workload) => (
                <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden py-4 gap-4 h-full flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base text-text-primary truncate" title={workload.name}>{workload.name}</CardTitle>
                        <CardDescription className="truncate">{t("workloads.card.namespace", { ns: workload.namespace })}</CardDescription>
                      </div>
                      <StatusBadge
                        status={workload.status === "Healthy" ? "healthy" : "warning"}
                        label={workload.status}
                        size="sm"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">{t("workloads.field.lastRun")}</span>
                      <span className="text-xs text-text-muted">
                        {workload.updated_at ? new Date(workload.updated_at).toLocaleString() : t("common.never")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
