"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Server } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/hooks/use-translations";
import { metricsApi } from "@/lib/api";
import { NodeCard, type NodeMetrics } from "./NodeCard";

interface Cluster {
  id: number;
  name: string;
  is_active: boolean;
}

interface ClusterNodeData {
  clusterId: number;
  clusterName: string;
  available: boolean;
  nodes: NodeMetrics[];
}

interface NodeResourceSectionProps {
  clusters: Cluster[];
  isAuthenticated: boolean;
}

function NodeCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 animate-pulse space-y-3">
      <div className="h-4 w-24 bg-muted rounded" />
      <div className="flex justify-center gap-4">
        <div className="h-[90px] w-[90px] rounded-full bg-muted" />
        <div className="h-[90px] w-[90px] rounded-full bg-muted" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-full bg-muted rounded" />
      </div>
    </div>
  );
}

function NodeGrid({ nodes, clusterName }: { nodes: NodeMetrics[]; clusterName?: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {nodes.map((node) => (
        <NodeCard key={node.name} node={node} clusterName={clusterName} />
      ))}
    </div>
  );
}

export function NodeResourceSection({ clusters, isAuthenticated }: NodeResourceSectionProps) {
  const t = useTranslations("dashboard");

  const activeClusters = useMemo(
    () => clusters.filter((c) => c.is_active),
    [clusters],
  );

  const clusterNodeQueries = useQueries({
    queries: activeClusters.map((cluster) => ({
      queryKey: ["dashboard", "node-metrics", cluster.id],
      enabled: isAuthenticated,
      staleTime: 30_000,
      queryFn: async (): Promise<ClusterNodeData> => {
        const healthRes = await metricsApi.getClusterHealth(cluster.id);
        if (!healthRes.data?.available) {
          return { clusterId: cluster.id, clusterName: cluster.name, available: false, nodes: [] };
        }
        const nodeRes = await metricsApi.getNodeMetrics(cluster.id);
        return {
          clusterId: cluster.id,
          clusterName: cluster.name,
          available: true,
          nodes: nodeRes.data ?? [],
        };
      },
    })),
  });

  const isLoading = clusterNodeQueries.some((q) => q.isLoading);
  const clusterData: ClusterNodeData[] = clusterNodeQueries
    .map((q) => q.data)
    .filter((d): d is ClusterNodeData => !!d);

  const hasAnyNodes = clusterData.some((d) => d.nodes.length > 0);

  if (!activeClusters.length) return null;

  const showTabs = activeClusters.length > 1;

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center">
        <Server className="h-4 w-4 mr-1.5" />
        {t("nodeResourceUsage")}
      </h3>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <NodeCardSkeleton key={i} />
          ))}
        </div>
      ) : !hasAnyNodes ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          {t("noNodeMetrics") || t("metricsUnavailable")}
        </div>
      ) : showTabs ? (
        <Tabs defaultValue="all">
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="all">{t("allClusters") || "All Clusters"}</TabsTrigger>
            {activeClusters.map((c) => (
              <TabsTrigger key={c.id} value={String(c.id)}>
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="space-y-6 mt-4">
            {clusterData.map((cd) =>
              cd.nodes.length > 0 ? (
                <div key={cd.clusterId} className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">{cd.clusterName}</h4>
                  <NodeGrid nodes={cd.nodes} />
                </div>
              ) : null,
            )}
          </TabsContent>

          {activeClusters.map((cluster) => {
            const cd = clusterData.find((d) => d.clusterId === cluster.id);
            return (
              <TabsContent key={cluster.id} value={String(cluster.id)} className="mt-4">
                {!cd || !cd.available ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    {t("metricsUnavailable")}
                  </div>
                ) : cd.nodes.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    {t("noNodeMetrics") || "No node metrics available"}
                  </div>
                ) : (
                  <NodeGrid nodes={cd.nodes} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        /* Single cluster — no tabs needed */
        clusterData[0]?.nodes.length > 0 && <NodeGrid nodes={clusterData[0].nodes} />
      )}
    </section>
  );
}
