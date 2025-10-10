"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, TestTube, ArrowLeft, Loader2, Power, PowerOff } from "lucide-react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";

interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  is_active: boolean;
}

function ClustersPageContent() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchClusters = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/api/clusters", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClusters(data);
      } else {
        console.error("获取集群列表失败");
      }
    } catch (error) {
      console.error("获取集群列表出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCluster = async (clusterId: number, clusterName: string) => {
    if (!confirm(`确定要删除集群 "${clusterName}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/clusters/${clusterId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setClusters(clusters.filter(cluster => cluster.id !== clusterId));
      } else {
        alert("删除集群失败");
      }
    } catch (error) {
      console.error("删除集群出错:", error);
      alert("删除集群时发生错误");
    }
  };

  const handleTestConnection = async (clusterId: number, clusterName: string) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/clusters/${clusterId}/test-connection`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.status === "success") {
        alert(`集群 "${clusterName}" 连接测试成功！`);
      } else {
        alert(`集群 "${clusterName}" 连接测试失败：${result.message}`);
      }
    } catch (error) {
      console.error("测试连接出错:", error);
      alert("测试连接时发生错误");
    }
  };

  const handleToggleActive = async (cluster: Cluster) => {
    const action = cluster.is_active ? "停用" : "激活";
    if (!confirm(`确定要${action}集群 "${cluster.name}" 吗？`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/clusters/${cluster.id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: !cluster.is_active
        }),
      });

      if (response.ok) {
        // 更新本地状态
        setClusters(clusters.map(c =>
          c.id === cluster.id ? { ...c, is_active: !c.is_active } : c
        ));
        alert(`集群 "${cluster.name}" 已${action}成功！`);
      } else {
        const error = await response.json();
        alert(`${action}集群失败: ${error.detail || '未知错误'}`);
      }
    } catch (error) {
      console.error(`${action}集群出错:`, error);
      alert(`${action}集群时发生错误`);
    }
  };

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
            <Button asChild>
              <Link href="/clusters/new">
                <Plus className="h-4 w-4 mr-2" />
                添加集群
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            集群管理
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            管理您的Kubernetes集群配置
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : clusters.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  暂无集群
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  开始添加您的第一个Kubernetes集群
                </p>
                <Button asChild>
                  <Link href="/clusters/new">
                    <Plus className="h-4 w-4 mr-2" />
                    添加集群
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clusters.map((cluster) => (
              <Card key={cluster.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{cluster.name}</CardTitle>
                    <Badge variant={cluster.is_active ? "default" : "secondary"}>
                      {cluster.is_active ? "活跃" : "停用"}
                    </Badge>
                  </div>
                  <CardDescription>{cluster.endpoint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      认证方式: {cluster.auth_type === 'kubeconfig' ? 'Kubeconfig' : 'Token'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={cluster.is_active ? "secondary" : "default"}
                        onClick={() => handleToggleActive(cluster)}
                      >
                        {cluster.is_active ? (
                          <>
                            <PowerOff className="h-4 w-4 mr-1" />
                            停用
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4 mr-1" />
                            激活
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(cluster.id, cluster.name)}
                      >
                        <TestTube className="h-4 w-4 mr-1" />
                        测试连接
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link href={`/clusters/${cluster.id}/edit`}>
                          <Edit className="h-4 w-4 mr-1" />
                          编辑
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteCluster(cluster.id, cluster.name)}
                      >
                        <Trash2 className="h-4 w-4" />
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

export default function ClustersPage() {
  return (
    <AuthGuard>
      <ClustersPageContent />
    </AuthGuard>
  );
}
