"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Activity, Square, FileText, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";
import ClusterSelector from "@/components/ClusterSelector";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useResourceUpdates } from "@/hooks/useWebSocket";
import { useTranslations } from "next-intl";

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

function PodsPageContent() {
  const t = useTranslations("pods");
  const tCommon = useTranslations("common");

  const [pods, setPods] = useState<PodInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    showForceOption: false,
    forceOption: false,
  });
  const router = useRouter();
  const { activeCluster, isLoading: isClusterLoading, wsConnected } = useCluster();

  // WebSocket实时更新
  const { updates: podUpdates } = useResourceUpdates('pods');

  useEffect(() => {
    // 只有在集群加载完成后才获取数据
    if (!isClusterLoading) {
      fetchPods();
    }
  }, [selectedNamespace, isClusterLoading, activeCluster]);

  // 监听WebSocket Pod更新
  useEffect(() => {
    if (podUpdates.length > 0) {
      const latestUpdate = podUpdates[podUpdates.length - 1];
      const updateData = latestUpdate.data;

      // 检查更新是否属于当前集群和命名空间
      if (activeCluster && updateData.cluster_id === activeCluster.id) {
        if (!selectedNamespace || updateData.namespace === selectedNamespace) {
          console.log('Pod update received:', updateData);
          // 短暂延迟后刷新数据，避免频繁请求
          setTimeout(() => {
            fetchPods();
          }, 1000);
        }
      }
    }
  }, [podUpdates, activeCluster, selectedNamespace]);

  const fetchPods = async () => {
    try {
      setIsLoading(true);
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

  const handleDeletePod = (pod: PodInfo) => {
    setConfirmDialog({
      open: true,
      title: "删除Pod",
      description: `确定要删除Pod "${pod.name}" 吗？此操作不可撤销。`,
      onConfirm: () => performDeletePod(pod),
      showForceOption: true,
      forceOption: false,
    });
  };

  const handleForceOptionChange = (checked: boolean) => {
    setConfirmDialog(prev => ({ ...prev, forceOption: checked }));
  };

  const performDeletePod = async (pod: PodInfo) => {
    try {
      const token = localStorage.getItem("token");
      const url = new URL(`http://localhost:8000/api/pods/${pod.namespace}/${pod.name}`);
      url.searchParams.set('cluster_id', pod.cluster_id.toString());
      if (confirmDialog.forceOption) {
        url.searchParams.set('force', 'true');
      }

      const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const deleteType = confirmDialog.forceOption ? "强制" : "正常";
        toast.success(`Pod${deleteType}删除成功`);
        fetchPods();
      } else {
        toast.error("删除Pod失败");
      }
    } catch (error) {
      console.error("删除Pod出错:", error);
      toast.error("删除Pod时发生错误");
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
              <Select value={selectedNamespace || "all"} onValueChange={(value) => setSelectedNamespace(value === "all" ? "" : value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("selectNamespace")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allNamespaces")}</SelectItem>
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
                {t("refresh")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                {t("title")}
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {t("description")}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {wsConnected ? (
                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                  <Wifi className="h-3 w-3 mr-1" />
                  {t("realTimeConnected")}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <WifiOff className="h-3 w-3 mr-1" />
                  {t("realTimeDisconnected")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">{tCommon("loading")}</span>
          </div>
        ) : pods.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t("noPods")}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t("noPodsDescription")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pods.map((pod) => (
              <Card
                key={`${pod.cluster_id}-${pod.namespace}-${pod.name}`}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  console.log("Pod clicked:", pod);
                  console.log("Cluster ID:", pod.cluster_id);
                  if (pod.cluster_id == null || pod.cluster_id === undefined) {
                    toast.error("Pod缺少集群ID，无法查看详情");
                    return;
                  }
                  router.push(`/pods/${pod.namespace}/${pod.name}?cluster_id=${pod.cluster_id}`);
                }}
              >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewLogs(pod);
                        }}
                        title="查看日志"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePod(pod);
                        }}
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

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="destructive"
        showForceOption={confirmDialog.showForceOption}
        forceOption={confirmDialog.forceOption}
        onForceOptionChange={handleForceOptionChange}
      />
    </div>
  );
}

export default function PodsPage() {
  return (
    <AuthGuard>
      <PodsPageContent />
    </AuthGuard>
  );
}
