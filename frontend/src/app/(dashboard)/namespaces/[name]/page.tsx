"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Button } from "@/shared/ui/button";
import { fetchWorkloads, queryKeys } from "@/lib/api";

export default function NamespaceDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.name);

  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.workloads, ns],
    queryFn: fetchWorkloads,
  });

  const filtered = (workloads ?? []).filter((w) => w.namespace === ns);

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
    </div>
  );
}

