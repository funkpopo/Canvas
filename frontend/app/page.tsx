"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import {
  LogOut,
  Server,
  FolderPen,
  Activity,
  Settings,
  Database,
  Loader2,
  Settings2,
  Cpu,
  Shield,
  Lock,
  AlertCircle,
  Wifi,
  WifiOff,
  AlertTriangle,
  User as UserIcon,
  MemoryStick,
  Bell,
} from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { useTranslations } from "@/hooks/use-translations";
import { statsApi, metricsApi } from "@/lib/api";

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

function StatLoadingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-6 w-16 bg-muted rounded" />
      <div className="h-4 w-24 bg-muted rounded" />
    </div>
  );
}

export default function Home() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { wsConnected, wsConnecting, wsPolling, wsError, reconnectWebSocket, activeCluster } = useCluster();
  const [showSecondarySections, setShowSecondarySections] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      setShowSecondarySections(false);
      return;
    }

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const reveal = () => setShowSecondarySections(true);
    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(() => reveal(), { timeout: 1000 });
    } else {
      timeoutId = window.setTimeout(reveal, 200);
    }

    return () => {
      if (idleId !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isAuthenticated]);

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats"],
    enabled: isAuthenticated,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardStats> => {
      const response = await statsApi.getDashboardStats();
      if (response.data) {
        return response.data;
      }
      throw new Error(response.error || "Failed to load dashboard stats");
    },
  });

  const metricsQuery = useQuery({
    queryKey: ["dashboard", "metrics-bundle", activeCluster?.id ?? 0],
    enabled: isAuthenticated && !!activeCluster,
    staleTime: 30_000,
    queryFn: async (): Promise<DashboardMetricsBundle> => {
      if (!activeCluster) {
        return { available: false, clusterMetrics: null, nodeMetrics: [] };
      }

      const healthResponse = await metricsApi.getClusterHealth(activeCluster.id);
      if (!healthResponse.data?.available) {
        return { available: false, clusterMetrics: null, nodeMetrics: [] };
      }

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
  const metricsBundle = metricsQuery.data ?? {
    available: false,
    clusterMetrics: null,
    nodeMetrics: [],
  };
  const metricsAvailable = metricsBundle.available;
  const clusterMetrics = metricsBundle.clusterMetrics;
  const nodeMetrics = metricsBundle.nodeMetrics;
  const isLoadingMetrics = metricsQuery.isLoading || metricsQuery.isFetching;

  const wsStatusText = useMemo(() => {
    if (wsConnected) return t("connected");
    if (wsConnecting) return t("connecting");
    if (wsPolling) return t("polling");
    if (wsError) return t("connectionError");
    return t("disconnected");
  }, [wsConnected, wsConnecting, wsPolling, wsError, t]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Server className="h-8 w-8 text-zinc-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                Canvas
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <div className="flex items-center space-x-2">
                {wsConnected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : wsConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                ) : wsPolling ? (
                  <WifiOff className="h-4 w-4 text-amber-500" />
                ) : wsError ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-gray-500" />
                )}
                <span className="text-sm text-muted-foreground">{wsStatusText}</span>
              </div>
              {(wsPolling || wsError) && !wsConnecting && (
                <Button variant="outline" size="sm" onClick={reconnectWebSocket}>
                  {t("reconnectNow")}
                </Button>
              )}
              <LanguageToggle />
              <ThemeToggle />
              <Button variant="outline" asChild>
                <Link href="/user-center">
                  <UserIcon className="h-4 w-4 mr-2" />
                  {t("userCenter")}
                </Link>
              </Button>
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t("logout")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("manageResources")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="min-h-[132px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalClusters")}</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <StatLoadingSkeleton />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_clusters || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("activeClustersHint", { count: stats?.active_clusters || 0 })}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[132px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalNamespaces")}</CardTitle>
              <FolderPen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <StatLoadingSkeleton />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_namespaces || 0}</div>
                  <p className="text-xs text-muted-foreground">{t("includesSystem")}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[132px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalPods")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <StatLoadingSkeleton />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_pods || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats?.running_pods || 0} {t("running")}, {(stats?.total_pods || 0) - (stats?.running_pods || 0)} {t("stopped")}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[132px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalServices")}</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <StatLoadingSkeleton />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_services || 0}</div>
                  <p className="text-xs text-muted-foreground">{t("serviceTypesHint")}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {activeCluster && (
          <Card className="mb-8 min-h-[340px]">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2" />
                {t("clusterRealtimeMetrics")}
              </CardTitle>
              <CardDescription>
                {t("clusterUsageDescription", { cluster: clusterMetrics?.cluster_name ?? activeCluster.name })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>{t("metricsLoading")}</span>
                </div>
              ) : !metricsAvailable ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  {t("metricsUnavailable")}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t("clusterCpuUsage")}</CardDescription>
                        <CardTitle className="text-2xl">{t("cpuCoresValue", { value: clusterMetrics?.cpu_usage ?? "-" })}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t("clusterMemoryUsage")}</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.memory_usage ?? "-"}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t("clusterNodeCount")}</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.node_count ?? "-"}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t("clusterPodCount")}</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.pod_count ?? "-"}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  {nodeMetrics.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <Server className="h-5 w-5 mr-2" />
                        {t("nodeResourceUsage")}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {nodeMetrics.map((node) => (
                          <Card key={node.name}>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">{node.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <div className="flex justify-between mb-2">
                                  <span className="text-sm font-medium flex items-center">
                                    <Cpu className="h-4 w-4 mr-1" />
                                    {t("cpuUsageRate")}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {t("cpuUsageValue", {
                                      usage: node.cpu_usage,
                                      percentage: node.cpu_percentage.toFixed(1),
                                    })}
                                  </span>
                                </div>
                                <Progress value={node.cpu_percentage} />
                              </div>

                              <div>
                                <div className="flex justify-between mb-2">
                                  <span className="text-sm font-medium flex items-center">
                                    <MemoryStick className="h-4 w-4 mr-1" />
                                    {t("memoryUsageRate")}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {node.memory_usage} ({node.memory_percentage.toFixed(1)}%)
                                  </span>
                                </div>
                                <Progress value={node.memory_percentage} />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showSecondarySections ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("quickActions")}</CardTitle>
                <CardDescription>{t("quickActionsDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/nodes">
                      <Server className="h-6 w-6 mb-2" />
                      {t("quickActionNodes")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/namespaces">
                      <FolderPen className="h-6 w-6 mb-2" />
                      {t("quickActionNamespaces")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/pods">
                      <Activity className="h-6 w-6 mb-2" />
                      {t("quickActionPods")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/storage">
                      <Database className="h-6 w-6 mb-2" />
                      {t("quickActionStorage")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/services">
                      <Settings2 className="h-6 w-6 mb-2" />
                      {t("quickActionServices")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/configmaps">
                      <Database className="h-6 w-6 mb-2" />
                      {t("quickActionConfigMaps")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/secrets">
                      <Lock className="h-6 w-6 mb-2" />
                      {t("quickActionSecrets")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/network-policies">
                      <Shield className="h-6 w-6 mb-2" />
                      {t("quickActionNetworkPolicies")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/resource-quotas">
                      <Cpu className="h-6 w-6 mb-2" />
                      {t("quickActionResourceQuotas")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/events">
                      <AlertCircle className="h-6 w-6 mb-2" />
                      {t("quickActionEvents")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/clusters">
                      <Settings className="h-6 w-6 mb-2" />
                      {t("quickActionClusters")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/users">
                      <UserIcon className="h-6 w-6 mb-2" />
                      {t("quickActionUsers")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/audit-logs">
                      <Activity className="h-6 w-6 mb-2" />
                      {t("quickActionAuditLogs")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/rbac">
                      <Shield className="h-6 w-6 mb-2" />
                      {t("quickActionRbac")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/alerts">
                      <Bell className="h-6 w-6 mb-2" />
                      {t("quickActionAlerts")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>{t("workloadManagement")}</CardTitle>
                <CardDescription>{t("workloadManagementDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/deployments">
                      <Activity className="h-6 w-6 mb-2" />
                      {t("quickActionDeployments")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/statefulsets">
                      <Database className="h-6 w-6 mb-2" />
                      {t("quickActionStatefulSets")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/daemonsets">
                      <Server className="h-6 w-6 mb-2" />
                      {t("quickActionDaemonSets")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/jobs">
                      <Settings2 className="h-6 w-6 mb-2" />
                      {t("quickActionJobs")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/cronjobs">
                      <Activity className="h-6 w-6 mb-2" />
                      {t("quickActionCronJobs")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/hpas">
                      <Cpu className="h-6 w-6 mb-2" />
                      {t("quickActionHpas")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col" asChild>
                    <Link href="/ingress">
                      <Shield className="h-6 w-6 mb-2" />
                      {t("quickActionIngress")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="space-y-6">
            <Card className="h-[280px]">
              <CardContent className="h-full animate-pulse bg-muted/30 rounded-lg" />
            </Card>
            <Card className="h-[220px]">
              <CardContent className="h-full animate-pulse bg-muted/30 rounded-lg" />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

