"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Plus, Trash2, Loader2, Activity } from "lucide-react";

interface NamespaceInfo {
  name: string;
  status: string;
  age: string;
  cluster_name: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  cluster_id: number;
}

export default function NamespacesPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNamespaceName, setNewNamespaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
    fetchNamespaces();
  }, [router]);

  const fetchNamespaces = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/api/namespaces", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNamespaces(data);
      } else {
        console.error("获取命名空间列表失败");
      }
    } catch (error) {
      console.error("获取命名空间列表出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNamespace = async () => {
    if (!newNamespaceName.trim() || !selectedClusterId) {
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/namespaces?cluster_id=${selectedClusterId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newNamespaceName.trim(),
        }),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        setNewNamespaceName("");
        fetchNamespaces();
      } else {
        const error = await response.json();
        alert(`创建命名空间失败: ${error.detail}`);
      }
    } catch (error) {
      console.error("创建命名空间出错:", error);
      alert("创建命名空间时发生错误");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteNamespace = async (namespace: NamespaceInfo) => {
    // 保护系统命名空间
    const systemNamespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease'];
    if (systemNamespaces.includes(namespace.name)) {
      alert("不能删除系统命名空间");
      return;
    }

    if (!confirm(`确定要删除命名空间 "${namespace.name}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/namespaces/${namespace.name}?cluster_id=${namespace.cluster_id}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        fetchNamespaces();
      } else {
        alert("删除命名空间失败");
      }
    } catch (error) {
      console.error("删除命名空间出错:", error);
      alert("删除命名空间时发生错误");
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Active":
        return "default";
      case "Terminating":
        return "destructive";
      default:
        return "secondary";
    }
  };

  // 获取可用的集群列表（从命名空间数据中提取）
  const availableClusters = Array.from(
    new Set(namespaces.map(ns => `${ns.cluster_id}:${ns.cluster_name}`))
  ).map(clusterStr => {
    const [id, name] = clusterStr.split(':');
    return { id: parseInt(id), name };
  });

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
            <div className="flex space-x-2">
              <Button variant="outline" onClick={fetchNamespaces} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4 mr-2" />
                )}
                刷新
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    创建命名空间
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>创建新命名空间</DialogTitle>
                    <DialogDescription>
                      输入命名空间名称和选择集群
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="namespace-name">命名空间名称</Label>
                      <Input
                        id="namespace-name"
                        value={newNamespaceName}
                        onChange={(e) => setNewNamespaceName(e.target.value)}
                        placeholder="输入命名空间名称"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cluster-select">选择集群</Label>
                      <select
                        id="cluster-select"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={selectedClusterId || ""}
                        onChange={(e) => setSelectedClusterId(parseInt(e.target.value))}
                      >
                        <option value="">选择集群</option>
                        {availableClusters.map((cluster) => (
                          <option key={cluster.id} value={cluster.id}>
                            {cluster.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                      >
                        取消
                      </Button>
                      <Button
                        onClick={handleCreateNamespace}
                        disabled={isCreating || !newNamespaceName.trim() || !selectedClusterId}
                      >
                        {isCreating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        创建
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            命名空间管理
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            管理Kubernetes集群中的命名空间资源
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : namespaces.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                暂无命名空间
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                开始创建您的第一个命名空间
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                创建命名空间
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {namespaces.map((namespace) => (
              <Card key={`${namespace.cluster_id}-${namespace.name}`} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{namespace.name}</CardTitle>
                    <Badge variant={getStatusBadgeVariant(namespace.status)}>
                      {namespace.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {namespace.cluster_name} • {namespace.age}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* 标签信息 */}
                    {Object.keys(namespace.labels).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">标签</h4>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(namespace.labels).slice(0, 3).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                          {Object.keys(namespace.labels).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{Object.keys(namespace.labels).length - 3} 更多
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex justify-end space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteNamespace(namespace)}
                        disabled={['default', 'kube-system', 'kube-public', 'kube-node-lease'].includes(namespace.name)}
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
