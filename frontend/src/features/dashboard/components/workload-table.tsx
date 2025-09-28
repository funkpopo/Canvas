import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { StatusBadge } from "@/shared/ui/status-badge";
import { queryKeys, fetchWorkloads } from "@/lib/api";

export function WorkloadTable() {
  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  const limitedWorkloads = workloads?.slice(0, 8) || [];

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">Workload status</CardTitle>
        <CardDescription>Running deployments, StatefulSets, and DaemonSets</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Button
          variant="outline"
          size="sm"
          className={`mb-4 ${badgePresets.label}`}
        >
          View all workloads
        </Button>
        <table className="w-full text-sm">
          <thead className={`${badgePresets.label} text-text-muted`}>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Namespace</th>
              <th className="px-4 py-3 text-left">Kind</th>
              <th className="px-4 py-3 text-left">Version</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Replicas</th>
              <th className="px-4 py-3 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  Loading workloads…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  Unable to load workloads from the cluster.
                </td>
              </tr>
            ) : limitedWorkloads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  No workloads found.
                </td>
              </tr>
            ) : (
              limitedWorkloads.map((workload) => (
                <tr key={`${workload.namespace}-${workload.name}`} className="border-b border-border/60 last:border-none">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">{workload.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-muted">{workload.namespace}</td>
                  <td className="whitespace-nowrap px-4 py-3">{workload.kind}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                      {workload.version || 'N/A'}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge 
                      status={workload.status === "Healthy" ? "healthy" : "warning"} 
                      label={workload.status}
                      size="sm"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant="outline" size="sm" className={badgePresets.metric}>
                      {workload.replicas_ready ?? 0} / {workload.replicas_desired ?? 0}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                    {workload.updated_at ? new Date(workload.updated_at).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

