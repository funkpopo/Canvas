"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Server,
  FolderPen,
  Activity,
  Settings,
  Loader2,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { useTranslations } from "@/hooks/use-translations";
import { statsApi, metricsApi } from "@/lib/api";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { STATUS_COLORS } from "@/lib/chart-colors";

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

interface NodeMetrics {
  name: string;
  cpu_usage: string;
  memory_usage: string;
  cpu_percentage: number;
  memory_percentage: number;
  timestamp: string;
}

interface DashboardMetricsBundle {
  available: boolean;
  clusterMetrics: ClusterMetrics | null;
  nodeMetrics: NodeMetrics[];
}

function StatItem({ icon: Icon, value, label, sub }: {
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

function getProgressColor(value: number): string {
  if (value >= 80) return "bg-red-500";
  if (value >= 60) return "bg-amber-500";
  return "";
}

export default function Home() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { activeCluster } = useCluster();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

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
      if (!activeCluster) return { available: false, clusterMetrics: null, nodeMetrics: [] };
      const healthResponse = await metricsApi.getClusterHealth(activeCluster.id);
      if (!healthResponse.data?.available) return { available: false, clusterMetrics: null, nodeMetrics: [] };
      const [clusterResponse, nodeResponse] = await Promise.all([
        metricsApi.getClusterMetrics(activeCluster.id),
        metricsApi.getNodeMetrics(activeCluster.id),
      ]);
      return {
        available: true,
        clusterMetrics: clusterResponse.data ?? null,
        nodeMetrics: nodeResponse.data ?? [],
      };
    },
  });

  const stats = statsQuery.data ?? null;
  const isLoadingStats = statsQuery.isLoading && !stats;
  const metricsBundle = metricsQuery.data ?? { available: false, clusterMetrics: null, nodeMetrics: [] };
  const metricsAvailable = metricsBundle.available;
  const clusterMetrics = metricsBundle.clusterMetrics;
  const nodeMetrics = metricsBundle.nodeMetrics;
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

  // Node resource bar chart data
  const nodeBarData = useMemo(() => {
    return nodeMetrics.map((node) => ({
      name: node.name.length > 12 ? node.name.slice(0, 12) + "..." : node.name,
      CPU: Math.round(node.cpu_percentage * 10) / 10,
      Memory: Math.round(node.memory_percentage * 10) / 10,
    }));
  }, [nodeMetrics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

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
            <StatItem icon={Server} value={stats?.total_clusters || 0} label={t("totalClusters")} sub={t("activeClustersHint", { count: stats?.active_clusters || 0 })} />
            <StatItem icon={FolderPen} value={stats?.total_namespaces || 0} label={t("totalNamespaces")} />
            <StatItem icon={Activity} value={stats?.total_pods || 0} label={t("totalPods")} sub={`${stats?.running_pods || 0} ${t("running")}`} />
            <StatItem icon={Settings} value={stats?.total_services || 0} label={t("totalServices")} />
          </>
        )}
      </div>

      {/* Charts section */}
      {activeCluster && (
        <div className="space-y-6">
          {/* Cluster info line */}
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">{clusterMetrics?.cluster_name ?? activeCluster.name}</span>
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
            <>
              {/* Charts grid: Donut + Bar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pod status donut */}
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

                {/* Node resource bar chart */}
                {nodeBarData.length > 0 && (
                  <section className="border rounded-lg p-4">
                    <h3 className="text-sm font-medium mb-2">{t("nodeResourceUsage")}</h3>
                    <BarChart
                      data={nodeBarData}
                      xKey="name"
                      series={[
                        { key: "CPU", label: "CPU %", color: "#3b82f6" },
                        { key: "Memory", label: "Memory %", color: "#22c55e" },
                      ]}
                      height={220}
                      showGrid={false}
                      barSize={16}
                    />
                  </section>
                )}
              </div>

              {/* Node resource usage - flat list with progress bars */}
              {nodeMetrics.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center">
                    <Server className="h-4 w-4 mr-1.5" />
                    {t("nodeResourceUsage")}
                  </h3>
                  <div className="space-y-3">
                    {nodeMetrics.map((node) => (
                      <div key={node.name} className="flex items-center gap-4">
                        <span className="w-36 text-sm font-medium truncate">{node.name}</span>
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs w-8 text-muted-foreground">CPU</span>
                            <div className="flex-1">
                              <Progress value={node.cpu_percentage} className={`h-2 ${getProgressColor(node.cpu_percentage)}`} />
                            </div>
                            <span className="text-xs w-16 text-right tabular-nums">
                              {node.cpu_usage} ({node.cpu_percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs w-8 text-muted-foreground">Mem</span>
                            <div className="flex-1">
                              <Progress value={node.memory_percentage} className={`h-2 ${getProgressColor(node.memory_percentage)}`} />
                            </div>
                            <span className="text-xs w-16 text-right tabular-nums">
                              {node.memory_usage} ({node.memory_percentage.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

