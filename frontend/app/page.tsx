"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogOut, Server, FolderPen, Activity, Settings, Database, Loader2, Settings2, Cpu, Shield, Lock, AlertCircle, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";

interface DashboardStats {
  total_clusters: number;
  active_clusters: number;
  total_nodes: number;
  total_namespaces: number;
  total_pods: number;
  running_pods: number;
  total_services: number;
}

export default function Home() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { wsConnected, wsConnecting, wsError } = useCluster();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (isAuthenticated) {
      fetchDashboardStats();
    }
  }, [isAuthenticated, isLoading, router]);

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/api/stats/dashboard", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error("获取统计数据失败");
      }
    } catch (error) {
      console.error("获取统计数据出错:", error);
    } finally {
      setIsLoadingStats(false);
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
                  {wsConnected ? '已连接' : wsConnecting ? '连接中' : wsError ? '连接错误' : '未连接'}
                </span>
              </div>
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                登出
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            管理Kubernetes集群资源
          </p>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">集群节点</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_nodes || 0}</div>
                  <p className="text-xs text-muted-foreground">活跃节点</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">命名空间</CardTitle>
              <FolderPen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_namespaces || 0}</div>
                  <p className="text-xs text-muted-foreground">包含系统和用户命名空间</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pod数量</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_pods || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats?.running_pods || 0} 运行中，{(stats?.total_pods || 0) - (stats?.running_pods || 0)} 停止
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">服务</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_services || 0}</div>
                  <p className="text-xs text-muted-foreground">负载均衡器和ClusterIP</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

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
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
