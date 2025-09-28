import { useQuery } from "@tanstack/react-query";

import { queryKeys, fetchClusterOverview } from "@/lib/api";
import { ResourceCard } from "@/shared/ui/resource-card";
import { Badge, badgePresets } from "@/shared/ui/badge";

export function OverviewGrid() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.clusterOverview,
    queryFn: fetchClusterOverview,
  });

  const totalPods = data?.total_pods ?? 0;
  const healthyPods = data?.healthy_pods ?? 0;
  const pendingPods = data?.pending_pods ?? 0;
  const failingPods = data?.failing_pods ?? 0;
  const readyNodes = data?.ready_nodes ?? 0;
  const totalNodes = data?.node_count ?? 0;

  const podHealthPercent = totalPods > 0 ? Math.round((healthyPods / totalPods) * 100) : 0;
  const pendingPercent = totalPods > 0 ? Math.round((pendingPods / totalPods) * 100) : 0;
  const failingPercent = totalPods > 0 ? Math.round((failingPods / totalPods) * 100) : 0;
  const nodeHealthPercent = totalNodes > 0 ? Math.round((readyNodes / totalNodes) * 100) : 0;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ResourceCard
        label="Cluster version"
        value={isLoading ? "…" : data?.kubernetes_version ?? "unknown"}
        description={isError ? "无法连接到后端" : data?.cluster_name ?? "未配置"}
        trend={
          <Badge variant="success" size="sm" className={badgePresets.label}>
            {isLoading ? "加载中" : "Active"}
          </Badge>
        }
      />
      <ResourceCard
        label="Nodes"
        value={`${readyNodes}/${totalNodes}`}
        description="Ready / total nodes"
        trend={
          <Badge variant="info-light" size="sm" className={badgePresets.label}>
            {nodeHealthPercent}% ready
          </Badge>
        }
      />
      <ResourceCard
        label="Namespaces"
        value={isLoading ? "…" : String(data?.namespace_count ?? 0)}
        description="Namespaces discovered"
        trend={
          <Badge variant="neutral-light" size="sm" className={badgePresets.label}>
            {isLoading ? "加载中" : "Synced"}
          </Badge>
        }
      />
      <ResourceCard
        label="Pods"
        value={String(totalPods)}
        description={`${healthyPods} healthy • ${pendingPods} pending • ${failingPods} failing`}
        trend={
          <div className="flex flex-wrap gap-1">
            <Badge variant="success-light" size="sm" className={badgePresets.metric}>
              {podHealthPercent}% healthy
            </Badge>
            <Badge variant="warning-light" size="sm" className={badgePresets.metric}>
              {pendingPercent}% pending
            </Badge>
            <Badge variant="error-light" size="sm" className={badgePresets.metric}>
              {failingPercent}% failing
            </Badge>
          </div>
        }
      />
    </section>
  );
}


