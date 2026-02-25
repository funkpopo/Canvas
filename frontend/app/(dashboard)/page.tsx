"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Server, FolderPen, Activity, Settings, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { useTranslations } from "@/hooks/use-translations";
import { statsApi, metricsApi } from "@/lib/api";
import { DonutChart } from "@/components/charts/DonutChart";
import { STATUS_COLORS } from "@/lib/chart-colors";
import { NodeResourceSection } from "@/components/dashboard/NodeResourceSection";

interface DashboardStats {
  total_clusters: number;
  active_clusters: number;
  total_nodes: number;
  total_namespaces: number;
  total_pods: number;
  running_pods: number;
  total_services: number;
}

interface ClusterMetrics {
  cluster_id: number;
  cluster_name: string;
  cpu_usage: string;
  memory_usage: string;
  pod_count: number;
  node_count: number;
  timestamp: string;
}

interface DashboardMetricsBundle {
  available: boolean;
  clusterMetrics: ClusterMetrics | null;
}

function StatItem({
  icon: Icon,
  value,
  label,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function StatLoadingSkeleton() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="h-10 w-10 bg-muted rounded-lg" />
      <div className="space-y-1.5">
        <div className="h-6 w-12 bg-muted rounded" />
        <div className="h-3 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}

export default function Home() {
  const t = useTranslations("dashboard");
  const { isAuthenticated } = useAuth();
  const { activeCluster, clusters } = useCluster();

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats"],
    enabled: isAuthenticated,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardStats> => {
      const response = await statsApi.getDashboardStats();
      if (response.data) return response.data;
      throw new Error(response.error || "Failed to load dashboard stats");
    },
  });

  const metricsQuery = useQuery({
    queryKey: ["dashboard", "metrics-bundle", activeCluster?.id ?? 0],
    enabled: isAuthenticated && !!activeCluster,
    staleTime: 30_000,
    queryFn: async (): Promise<DashboardMetricsBundle> => {
      if (!activeCluster) return { available: false, clusterMetrics: null };
      const healthResponse = await metricsApi.getClusterHealth(activeCluster.id);
      if (!healthResponse.data?.available) return { available: false, clusterMetrics: null };
      const clusterResponse = await metricsApi.getClusterMetrics(activeCluster.id);
      return {
        available: true,
        clusterMetrics: clusterResponse.data ?? null,
      };
    },
  });

  const stats = statsQuery.data ?? null;
  const isLoadingStats = statsQuery.isLoading && !stats;
  const metricsBundle = metricsQuery.data ?? { available: false, clusterMetrics: null };
  const metricsAvailable = metricsBundle.available;
  const clusterMetrics = metricsBundle.clusterMetrics;
  const isLoadingMetrics = metricsQuery.isLoading || metricsQuery.isFetching;

  // Pod status donut data
  const podDonutData = useMemo(() => {
    if (!stats) return [];
    const running = stats.running_pods || 0;
    const other = (stats.total_pods || 0) - running;
    return [
      { name: t("running"), value: running, color: STATUS_COLORS.running },
      ...(other > 0 ? [{ name: t("stopped"), value: other, color: STATUS_COLORS.pending }] : []),
    ];
  }, [stats, t]);

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold">{t("title") || "Dashboard"}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("manageResources")}</p>
      </div>

      {/* Stats row - flat, no cards */}
      <div className="flex items-center gap-8 py-4 border-b flex-wrap">
        {isLoadingStats ? (
          <>
            <StatLoadingSkeleton />
            <StatLoadingSkeleton />
            <StatLoadingSkeleton />
            <StatLoadingSkeleton />
          </>
        ) : (
          <>
            <StatItem
              icon={Server}
              value={stats?.total_clusters || 0}
              label={t("totalClusters")}
              sub={t("activeClustersHint", { count: stats?.active_clusters || 0 })}
            />
            <StatItem
              icon={FolderPen}
              value={stats?.total_namespaces || 0}
              label={t("totalNamespaces")}
            />
            <StatItem
              icon={Activity}
              value={stats?.total_pods || 0}
              label={t("totalPods")}
              sub={`${stats?.running_pods || 0} ${t("running")}`}
            />
            <StatItem
              icon={Settings}
              value={stats?.total_services || 0}
              label={t("totalServices")}
            />
          </>
        )}
      </div>

      {/* Charts section */}
      {activeCluster && (
        <div className="space-y-6">
          {/* Cluster info line */}
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">
              {clusterMetrics?.cluster_name ?? activeCluster.name}
            </span>
            {metricsAvailable && clusterMetrics && (
              <>
                <span className="text-muted-foreground">CPU: {clusterMetrics.cpu_usage}</span>
                <span className="text-muted-foreground">Memory: {clusterMetrics.memory_usage}</span>
                <span className="text-muted-foreground">Nodes: {clusterMetrics.node_count}</span>
                <span className="text-muted-foreground">Pods: {clusterMetrics.pod_count}</span>
              </>
            )}
          </div>

          {isLoadingMetrics ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">{t("metricsLoading")}</span>
            </div>
          ) : !metricsAvailable ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              {t("metricsUnavailable")}
            </div>
          ) : (
            <section className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-2">{t("totalPods")}</h3>
              <DonutChart
                data={podDonutData}
                height={220}
                innerRadius={55}
                outerRadius={80}
                centerValue={stats?.total_pods || 0}
                centerLabel="Pods"
                showLegend={true}
              />
            </section>
          )}

          {/* Node resource usage - card grid with ring gauges */}
          <NodeResourceSection clusters={clusters} isAuthenticated={isAuthenticated} />
        </div>
      )}
    </div>
  );
}
