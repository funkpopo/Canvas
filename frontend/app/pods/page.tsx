"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Activity, Square, FileText, Loader2, RefreshCw } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";
import ClusterSelector from "@/components/ClusterSelector";

interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  age: string;
  restarts: number;
  ready_containers: string;
  cluster_name: string;
  labels: Record<string, string>;
  cluster_id: number;
}

export default function PodsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([]);
  const router = useRouter();
  const { activeCluster, isLoading: isClusterLoading } = useCluster();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    // 只有在认证完成且集群加载完成后才获取数据
    if (isAuthenticated && !isClusterLoading) {
      fetchPods();
    }
  }, [selectedNamespace, isAuthenticated, isClusterLoading, activeCluster]);

  const fetchPods = async () => {
    try {
      const token = localStorage.getItem("token");
      const url = new URL("http://localhost:8000/api/pods");

      if (activeCluster) {
        url.searchParams.set('cluster_id', activeCluster.id.toString());
      }
      if (selectedNamespace) {
        url.searchParams.set('namespace', selectedNamespace);
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPods(data);

        // 提取可用的命名空间列表
        const namespaces = Array.from(new Set(data.map((pod: PodInfo) => pod.namespace))) as string[];
        setAvailableNamespaces(namespaces);
      } else {
        console.error("获取Pod列表失败");
        setPods([]);
        setAvailableNamespaces([]);
      }
    } catch (error) {
      console.error("获取Pod列表出错:", error);
      setPods([]);
      setAvailableNamespaces([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestartPod = async (pod: PodInfo) => {
    if (!confirm(`确定要重启Pod "${pod.name}" 吗？`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/pods/${pod.namespace}/${pod.name}/restart?cluster_id=${pod.cluster_id}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        alert("Pod重启成功");
        fetchPods();
      } else {
        alert("重启Pod失败");
      }
    } catch (error) {
      console.error("重启Pod出错:", error);
      alert("重启Pod时发生错误");
    }
  };

  const handleDeletePod = async (pod: PodInfo) => {
    if (!confirm(`确定要删除Pod "${pod.name}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/pods/${pod.namespace}/${pod.name}?cluster_id=${pod.cluster_id}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        alert("Pod删除成功");
        fetchPods();
      } else {
        alert("删除Pod失败");
      }
    } catch (error) {
      console.error("删除Pod出错:", error);
      alert("删除Pod时发生错误");
    }
  };

  const handleViewLogs = (pod: PodInfo) => {
    // 打开新窗口查看日志
    const logsUrl = `/pods/${pod.namespace}/${pod.name}/logs?cluster_id=${pod.cluster_id}`;
    window.open(logsUrl, '_blank', 'width=800,height=600');
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Running":
        return "default";
      case "Pending":
        return "secondary";
      case "Succeeded":
        return "default";
      case "Failed":
        return "destructive";
      case "CrashLoopBackOff":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回仪表板</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <Select value={selectedNamespace || "all"} onValueChange={(value) => setSelectedNamespace(value === "all" ? "" : value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="选择命名空间" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部命名空间</SelectItem>
                  {availableNamespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>
                      {ns}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={fetchPods} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                刷新
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Pod监控
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            实时监控和管理Kubernetes集群中的Pod资源
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : pods.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                暂无Pod
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                没有找到任何Pod信息
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pods.map((pod) => (
              <Card key={`${pod.cluster_id}-${pod.namespace}-${pod.name}`} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg truncate max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title={pod.name}>
                      {pod.name}
                    </CardTitle>
                    <Badge variant={getStatusBadgeVariant(pod.status)}>
                      {pod.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {pod.cluster_name} • {pod.namespace} • {pod.age}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Pod信息 */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">节点:</span>
                        <span>{pod.node_name || "未调度"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">容器:</span>
                        <span>{pod.ready_containers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">重启次数:</span>
                        <span>{pod.restarts}</span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-end space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewLogs(pod)}
                        title="查看日志"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestartPod(pod)}
                        title="重启Pod"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeletePod(pod)}
                        title="删除Pod"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
