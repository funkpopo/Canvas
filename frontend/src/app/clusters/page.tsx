"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/status-badge";
import {
  fetchClusterConfig,
  listClusterConfigs,
  queryKeys,
  selectActiveClusterByName,
} from "@/lib/api";

export default function ClustersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: active } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  const { data: clusters, isLoading } = useQuery({
    queryKey: queryKeys.clusterConfigsAll,
    queryFn: listClusterConfigs,
  });

  const selectMutation = useMutation({
    mutationFn: async (name: string) => selectActiveClusterByName(name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfig }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.events }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workloads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterCapacity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.metricsStatus }),
      ]);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Clusters"
        title="Clusters overview"
        description="View and manage all saved clusters."
        actions={
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push("/clusters/manage")}>
              Add cluster
            </Button>
          </div>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">Saved clusters</CardTitle>
          <CardDescription>
            {isLoading ? "Loading clusters..." : "Manage and open your clusters."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {clusters && clusters.length > 0 ? (
            clusters.map((c) => {
              const isActive = active ? c.id === active.id : false;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-text-primary">{c.name}</p>
                      {isActive && (
                        <StatusBadge status="ready" label="Active" size="sm" />
                      )}
                    </div>
                    <p className="text-xs text-text-muted">
                      {c.api_server ?? (c.kubeconfig_present ? "kubeconfig" : "no endpoint")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={selectMutation.isPending}
                      onClick={async () => {
                        await selectMutation.mutateAsync(c.name);
                        router.push("/");
                      }}
                    >
                      {selectMutation.isPending ? "Opening..." : "Open"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectMutation.isPending}
                      onClick={async () => {
                        await selectMutation.mutateAsync(c.name);
                        router.push("/clusters/manage");
                      }}
                    >
                      Edit settings
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-text-muted">No clusters saved yet. Click "Add cluster" to create one.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
