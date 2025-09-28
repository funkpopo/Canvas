"use client";

import { useQuery } from "@tanstack/react-query";
import { GitBranch, LayoutDashboard, Timer } from "lucide-react";
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

export default function WorkloadsPage() {
  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  const deployments = workloads?.filter(w => w.kind === "Deployment") ?? [];
  const statefulsets = workloads?.filter(w => w.kind === "StatefulSet") ?? [];
  const cronjobs = workloads?.filter(w => w.kind === "CronJob") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workload catalog"
        title="Deeper workload intelligence"
        description="Drill into Kubernetes objects with version history, rollout progress, and SLO alignment."
        actions={
          <Button type="button" className="bg-gradient-to-r from-violet-400 to-fuchsia-500 text-slate-900 hover:from-violet-300 hover:to-fuchsia-400">
            Create deployment
          </Button>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Deployments</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{deployments.length}</p>
              <p className="text-xs text-text-muted">Active deployment workloads.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>StatefulSets</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{statefulsets.length}</p>
              <p className="text-xs text-text-muted">Stateful application workloads.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>CronJobs</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{cronjobs.length}</p>
              <p className="text-xs text-text-muted">Scheduled job workloads.</p>
            </div>
          </>
        }
      >
        <Badge variant="info-light" size="sm" className="border-sky-400/40">
          GitOps sync & drift detection ready
        </Badge>
      </PageHeader>

      <Tabs defaultValue="deployments" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="statefulsets">StatefulSets</TabsTrigger>
          <TabsTrigger value="cronjobs">CronJobs</TabsTrigger>
        </TabsList>
        
        <TabsContent value="deployments" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">Loading deployments...</p>
              </CardContent>
            </Card>
          ) : isError ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">Failed to load workloads. Please check your cluster connection.</p>
              </CardContent>
            </Card>
          ) : deployments.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <p className="text-text-muted">No deployments found</p>
                  <p className="text-xs text-text-muted">Create a deployment to get started</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deployments.map((workload, index) => (
                <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                          <LayoutDashboard className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base text-text-primary">{workload.name}</CardTitle>
                          <CardDescription>{workload.namespace} namespace</CardDescription>
                        </div>
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
                      <span className="text-text-muted">Replicas</span>
                      <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                        {workload.replicas_ready ?? 0}/{workload.replicas_desired ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">Version</span>
                      <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                        {workload.version || 'N/A'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">Updated</span>
                      <span className="text-xs text-text-muted">
                        {workload.updated_at ? new Date(workload.updated_at).toLocaleString() : 'Unknown'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="statefulsets" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-text-muted">Loading StatefulSets...</p>
              </CardContent>
            </Card>
          ) : statefulsets.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <p className="text-text-muted">No StatefulSets found</p>
                  <p className="text-xs text-text-muted">StatefulSets provide persistent storage for applications</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {statefulsets.map((workload) => (
                <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-teal-600">
                          <GitBranch className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base text-text-primary">{workload.name}</CardTitle>
                          <CardDescription>{workload.namespace} namespace</CardDescription>
                        </div>
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
                      <span className="text-text-muted">Replicas</span>
                      <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                        {workload.replicas_ready ?? 0}/{workload.replicas_desired ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">Version</span>
                      <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                        {workload.version || 'N/A'}
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
                <p className="text-text-muted">Loading CronJobs...</p>
              </CardContent>
            </Card>
          ) : cronjobs.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <p className="text-text-muted">No CronJobs found</p>
                  <p className="text-xs text-text-muted">CronJobs run tasks on a scheduled basis</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cronjobs.map((workload) => (
                <Card key={`${workload.namespace}-${workload.name}`} className="relative overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600">
                          <Timer className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base text-text-primary">{workload.name}</CardTitle>
                          <CardDescription>{workload.namespace} namespace</CardDescription>
                        </div>
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
                      <span className="text-text-muted">Last run</span>
                      <span className="text-xs text-text-muted">
                        {workload.updated_at ? new Date(workload.updated_at).toLocaleString() : 'Never'}
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

