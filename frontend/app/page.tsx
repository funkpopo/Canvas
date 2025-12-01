"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { LogOut, Server, FolderPen, Activity, Settings, Database, Loader2, Settings2, Cpu, Shield, Lock, AlertCircle, Wifi, WifiOff, AlertTriangle, User as UserIcon, MemoryStick, Bell } from "lucide-react";
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

export default function Home() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [clusterMetrics, setClusterMetrics] = useState<ClusterMetrics | null>(null);
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetrics[]>([]);
  const [metricsAvailable, setMetricsAvailable] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { wsConnected, wsConnecting, wsError, activeCluster } = useCluster();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (isAuthenticated) {
      fetchDashboardStats();
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (activeCluster) {
      checkMetricsAndFetch();
    } else {
      setMetricsAvailable(false);
      setClusterMetrics(null);
      setNodeMetrics([]);
    }
  }, [activeCluster]);

  const fetchDashboardStats = async () => {
    try {
      const response = await statsApi.getDashboardStats();
      if (response.data) {
        setStats(response.data);
      } else {
        console.error("获取统计数据失败:", response.error);
      }
    } catch (error) {
      console.error("获取统计数据出错:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const checkMetricsAndFetch = async () => {
    if (!activeCluster) return;

    setIsLoadingMetrics(true);
    try {
      // 检查metrics-server是否可用
      const healthResponse = await metricsApi.getClusterHealth(activeCluster.id);

      if (healthResponse.data) {
        setMetricsAvailable(healthResponse.data.available);

        if (healthResponse.data.available) {
          // 获取集群指标
          const clusterResponse = await metricsApi.getClusterMetrics(activeCluster.id);
          if (clusterResponse.data) {
            setClusterMetrics(clusterResponse.data);
          }

          // 获取节点指标
          const nodeResponse = await metricsApi.getNodeMetrics(activeCluster.id);
          if (nodeResponse.data) {
            setNodeMetrics(nodeResponse.data);
          }
        }
      }
    } catch (error) {
      console.error("获取metrics失败:", error);
      setMetricsAvailable(false);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  // 显示loading状态
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
      {/* Header */}
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
              {/* WebSocket状态指示器 */}
              <div className="flex items-center space-x-2">
                {wsConnected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : wsConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                ) : wsError ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-gray-500" />
                )}
                <span className="text-sm text-muted-foreground">
                  {wsConnected ? t("connected") : wsConnecting ? t("connecting") : wsError ? t("connectionError") : t("disconnected")}
                </span>
              </div>
              <LanguageToggle />
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t("logout")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("manageResources")}
          </p>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalClusters")}</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_nodes || 0}</div>
                  <p className="text-xs text-muted-foreground">{tCommon("active")}{tCommon("nodes").toLowerCase()}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalNamespaces")}</CardTitle>
              <FolderPen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_namespaces || 0}</div>
                  <p className="text-xs text-muted-foreground">{t("includesSystem")}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalPods")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
                </div>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalServices")}</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_services || 0}</div>
                  <p className="text-xs text-muted-foreground">LoadBalancers and ClusterIPs</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Metrics Section - Only show if metrics-server is available */}
        {metricsAvailable && activeCluster && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2" />
                集群实时监控
              </CardTitle>
              <CardDescription>
                当前集群的资源使用情况 ({clusterMetrics?.cluster_name})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>加载监控数据...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Cluster Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>集群CPU使用</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.cpu_usage} 核</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>集群内存使用</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.memory_usage}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>节点数量</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.node_count}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Pod数量</CardDescription>
                        <CardTitle className="text-2xl">{clusterMetrics?.pod_count}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  {/* Node Metrics */}
                  {nodeMetrics.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <Server className="h-5 w-5 mr-2" />
                        节点资源使用
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
                                    CPU使用率
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {node.cpu_usage} 核 ({node.cpu_percentage.toFixed(1)}%)
                                  </span>
                                </div>
                                <Progress value={node.cpu_percentage} />
                              </div>

                              <div>
                                <div className="flex justify-between mb-2">
                                  <span className="text-sm font-medium flex items-center">
                                    <MemoryStick className="h-4 w-4 mr-1" />
                                    内存使用率
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

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
            <CardDescription>常用Kubernetes管理任务</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/nodes">
                  <Server className="h-6 w-6 mb-2" />
                  节点管理
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/namespaces">
                  <FolderPen className="h-6 w-6 mb-2" />
                  命名空间
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/pods">
                  <Activity className="h-6 w-6 mb-2" />
                  Pod监控
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/storage">
                  <Database className="h-6 w-6 mb-2" />
                  存储管理
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/services">
                  <Settings2 className="h-6 w-6 mb-2" />
                  服务管理
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/configmaps">
                  <Database className="h-6 w-6 mb-2" />
                  ConfigMaps
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/secrets">
                  <Lock className="h-6 w-6 mb-2" />
                  Secrets
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/network-policies">
                  <Shield className="h-6 w-6 mb-2" />
                  网络策略
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/resource-quotas">
                  <Cpu className="h-6 w-6 mb-2" />
                  资源配额
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/events">
                  <AlertCircle className="h-6 w-6 mb-2" />
                  事件查看
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/clusters">
                  <Settings className="h-6 w-6 mb-2" />
                  集群管理
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/users">
                  <UserIcon className="h-6 w-6 mb-2" />
                  用户管理
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/audit-logs">
                  <Activity className="h-6 w-6 mb-2" />
                  审计日志
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/rbac">
                  <Shield className="h-6 w-6 mb-2" />
                  RBAC权限
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/alerts">
                  <Bell className="h-6 w-6 mb-2" />
                  告警管理
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Kubernetes资源管理增强 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>工作负载管理</CardTitle>
            <CardDescription>管理有状态应用、守护进程、定时任务等</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/deployments">
                  <Activity className="h-6 w-6 mb-2" />
                  Deployments
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/statefulsets">
                  <Database className="h-6 w-6 mb-2" />
                  StatefulSets
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/daemonsets">
                  <Server className="h-6 w-6 mb-2" />
                  DaemonSets
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/jobs">
                  <Settings2 className="h-6 w-6 mb-2" />
                  Jobs
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/cronjobs">
                  <Activity className="h-6 w-6 mb-2" />
                  CronJobs
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/hpas">
                  <Cpu className="h-6 w-6 mb-2" />
                  HPAs
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col" asChild>
                <Link href="/ingress">
                  <Shield className="h-6 w-6 mb-2" />
                  Ingress
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
