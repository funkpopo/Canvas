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
import { ArrowLeft, FolderPen, Plus, Trash2, Loader2, Activity } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";
import ClusterSelector from "@/components/ClusterSelector";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { namespaceApi } from "@/lib/api";

interface NamespaceInfo {
  name: string;
  status: string;
  age: string;
  cluster_name: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  cluster_id: number;
}

function NamespacesPageContent() {
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNamespaceName, setNewNamespaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });
  const router = useRouter();
  const { activeCluster, isLoading: isClusterLoading } = useCluster();

  useEffect(() => {
    // 只有在集群加载完成后才获取数据
    console.log("useEffect triggered - isClusterLoading:", isClusterLoading, "activeCluster:", activeCluster);
    if (!isClusterLoading) {
      console.log("Calling fetchNamespaces");
      fetchNamespaces();
    }
  }, [isClusterLoading, activeCluster]);

  const fetchNamespaces = async () => {
    try {
      console.log("Active cluster:", activeCluster);

      const result = await namespaceApi.getNamespaces(activeCluster?.id);

      console.log("Response result:", result);

      if (result.data) {
        const data = result.data as unknown as NamespaceInfo[];
        console.log("Raw data from API:", data);
        console.log("Data length:", data.length);

        // 如果有活跃集群，过滤出该集群的命名空间；否则显示所有命名空间
        let filteredNamespaces: NamespaceInfo[];
        if (activeCluster) {
          filteredNamespaces = data.filter((ns: NamespaceInfo) => ns.cluster_id === activeCluster.id);
          console.log("Filtered by active cluster:", activeCluster.id, "result length:", filteredNamespaces.length);
        } else {
          filteredNamespaces = data;
          console.log("No active cluster, showing all namespaces");
        }

        console.log("Final namespaces to display:", filteredNamespaces);
        setNamespaces(filteredNamespaces);
      } else {
        console.error("获取命名空间列表失败");
        setNamespaces([]);
      }
    } catch (error) {
      console.error("获取命名空间列表出错:", error);
      setNamespaces([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNamespace = async () => {
    if (!newNamespaceName.trim() || !activeCluster) {
      return;
    }

    setIsCreating(true);
    try {
      const result = await namespaceApi.createNamespace(activeCluster.id, {
        name: newNamespaceName.trim(),
      });

      if (result.data) {
        setIsCreateDialogOpen(false);
        setNewNamespaceName("");
        fetchNamespaces();
        toast.success("命名空间创建成功");
      } else {
        toast.error(`创建命名空间失败: ${result.error}`);
      }
    } catch (error) {
      console.error("创建命名空间出错:", error);
      toast.error("创建命名空间时发生错误");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteNamespace = (namespace: NamespaceInfo) => {
    // 保护系统命名空间
    const systemNamespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease'];
    if (systemNamespaces.includes(namespace.name)) {
      toast.error("不能删除系统命名空间");
      return;
    }

    setConfirmDialog({
      open: true,
      title: "删除命名空间",
      description: `确定要删除命名空间 "${namespace.name}" 吗？此操作不可撤销。`,
      onConfirm: () => performDeleteNamespace(namespace),
    });
  };

  const performDeleteNamespace = async (namespace: NamespaceInfo) => {
    try {
      const result = await namespaceApi.deleteNamespace(namespace.cluster_id, namespace.name);

      if (!result.error) {
        fetchNamespaces();
        toast.success("命名空间删除成功");
      } else {
        toast.error("删除命名空间失败");
      }
    } catch (error) {
      console.error("删除命名空间出错:", error);
      toast.error("删除命名空间时发生错误");
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


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
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
                      在当前集群中创建新的命名空间
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
                    {activeCluster && (
                      <div>
                        <Label>目标集群</Label>
                        <div className="px-3 py-2 bg-muted rounded-md text-sm">
                          {activeCluster.name} ({activeCluster.endpoint})
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                      >
                        取消
                      </Button>
                      <Button
                        onClick={handleCreateNamespace}
                        disabled={isCreating || !newNamespaceName.trim() || !activeCluster}
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
              <FolderPen className="h-12 w-12 text-gray-400 mb-4" />
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
              <Card
                key={`${namespace.cluster_id}-${namespace.name}`}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  console.log("Namespace clicked:", namespace);
                  console.log("Cluster ID:", namespace.cluster_id);
                  if (!namespace.cluster_id) {
                    toast.error("命名空间缺少集群ID，无法查看详情");
                    return;
                  }
                  router.push(`/namespaces/${namespace.name}?cluster_id=${namespace.cluster_id}`);
                }}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CardTitle className="text-lg truncate max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title={namespace.name}>
                        {namespace.name}
                      </CardTitle>
                      {['default', 'kube-system', 'kube-public', 'kube-node-lease'].includes(namespace.name) && (
                        <Badge variant="secondary" className="text-xs">
                          系统
                        </Badge>
                      )}
                    </div>
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

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="destructive"
      />
    </div>
  );
}

export default function NamespacesPage() {
  return (
    <AuthGuard>
      <NamespacesPageContent />
    </AuthGuard>
  );
}
