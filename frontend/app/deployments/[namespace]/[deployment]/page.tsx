"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Activity, Cpu, MemoryStick, Loader2, RefreshCw, AlertCircle, Play, Square, RotateCcw, Trash2, Settings } from "lucide-react";
import DeploymentConfigTab from "@/components/DeploymentConfigTab";
import DeploymentYamlTab from "@/components/DeploymentYamlTab";
import DeploymentServicesTab from "@/components/DeploymentServicesTab";
import DeploymentScalingTab from "@/components/DeploymentScalingTab";

interface DeploymentDetails {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  updated_replicas: number;
  unavailable_replicas: number;
  age: string;
  creation_timestamp: string;
  strategy: {
    type: string;
    rolling_update?: {
      max_unavailable: string;
      max_surge: string;
    };
  };
  selector: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  conditions: Array<{
    type: string;
    status: string;
    last_update_time: string;
    last_transition_time: string;
    reason: string;
    message: string;
  }>;
  spec: any;
  status: any;
  cluster_id: number;
  cluster_name: string;
}

interface DeploymentPod {
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  age: string;
  restarts: number;
  ready_containers: string;
  labels: Record<string, string>;
}

export default function DeploymentDetailsPage({ params }: { params: Promise<{ namespace: string; deployment: string }> }) {
  const resolvedParams = use(params);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deploymentDetails, setDeploymentDetails] = useState<DeploymentDetails | null>(null);
  const [deploymentPods, setDeploymentPods] = useState<DeploymentPod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isScaleDialogOpen, setIsScaleDialogOpen] = useState(false);
  const [newReplicas, setNewReplicas] = useState(0);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const clusterId = searchParams.get('cluster_id');

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    if (isAuthenticated && clusterId) {
      fetchDeploymentData();
    }
  }, [isAuthenticated, clusterId, resolvedParams.namespace, resolvedParams.deployment, activeTab]);

  const fetchDeploymentData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");

      if (activeTab === "overview") {
        // 获取部署详情
        const detailsResponse = await fetch(
          `http://localhost:8000/api/deployments/${resolvedParams.namespace}/${resolvedParams.deployment}?cluster_id=${clusterId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          }
        );

        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          setDeploymentDetails(detailsData);
          setNewReplicas(detailsData.replicas);
        }
      } else if (activeTab === "pods") {
        // 获取部署管理的Pods
        const podsResponse = await fetch(
          `http://localhost:8000/api/deployments/${resolvedParams.namespace}/${resolvedParams.deployment}/pods?cluster_id=${clusterId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          }
        );

        if (podsResponse.ok) {
          const podsData = await podsResponse.json();
          setDeploymentPods(podsData);
        }
      }
    } catch (error) {
      console.error("获取部署数据出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScale = async () => {
    if (!deploymentDetails) return;

    setIsOperationLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${resolvedParams.namespace}/${resolvedParams.deployment}/scale?cluster_id=${clusterId}`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ replicas: newReplicas }),
        }
      );

      if (response.ok) {
        setIsScaleDialogOpen(false);
        await fetchDeploymentData(); // 刷新数据
      } else {
        console.error("扩容失败");
      }
    } catch (error) {
      console.error("扩容出错:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!deploymentDetails) return;

    setIsOperationLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${resolvedParams.namespace}/${resolvedParams.deployment}/restart?cluster_id=${clusterId}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        await fetchDeploymentData(); // 刷新数据
      } else {
        console.error("重启失败");
      }
    } catch (error) {
      console.error("重启出错:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deploymentDetails) return;

    if (!confirm(`确定要删除部署 ${resolvedParams.deployment} 吗？此操作不可撤销。`)) {
      return;
    }

    setIsOperationLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${resolvedParams.namespace}/${resolvedParams.deployment}?cluster_id=${clusterId}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        router.push(`/namespaces/${resolvedParams.namespace}?cluster_id=${clusterId}`);
      } else {
        console.error("删除失败");
      }
    } catch (error) {
      console.error("删除出错:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  if (!clusterId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href={`/namespaces/${resolvedParams.namespace}`} className="flex items-center">
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">返回命名空间详情</span>
                </Link>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                缺少集群信息
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                无法获取部署详情：缺少集群ID参数
              </p>
              <Link href={`/namespaces/${resolvedParams.namespace}`}>
                <Button>返回命名空间详情</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

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
              <Link href={`/namespaces/${resolvedParams.namespace}?cluster_id=${clusterId}`} className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回命名空间详情</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2">
              <Dialog open={isScaleDialogOpen} onOpenChange={setIsScaleDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    扩容
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>调整副本数</DialogTitle>
                    <DialogDescription>
                      修改部署 {resolvedParams.deployment} 的副本数量
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="replicas" className="text-right">
                        副本数
                      </Label>
                      <Input
                        id="replicas"
                        type="number"
                        value={newReplicas}
                        onChange={(e) => setNewReplicas(parseInt(e.target.value) || 0)}
                        className="col-span-3"
                        min="0"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleScale}
                      disabled={isOperationLoading || newReplicas < 0}
                    >
                      {isOperationLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      确认调整
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRestart}
                disabled={isOperationLoading}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                重启
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isOperationLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </Button>

              <Button variant="outline" onClick={fetchDeploymentData} disabled={isLoading}>
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
            部署详情: {resolvedParams.deployment}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            命名空间: {resolvedParams.namespace} • 集群: {deploymentDetails?.cluster_name}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="config">配置</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="services">服务</TabsTrigger>
            <TabsTrigger value="scaling">伸缩</TabsTrigger>
            <TabsTrigger value="pods">Pods</TabsTrigger>
          </TabsList>

          {/* 概览标签页 */}
          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : deploymentDetails ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 基本信息 */}
                <Card>
                  <CardHeader>
                    <CardTitle>基本信息</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">状态</Label>
                        <div className="mt-1">
                          <Badge variant={deploymentDetails.ready_replicas === deploymentDetails.replicas ? "default" : "secondary"}>
                            {deploymentDetails.ready_replicas === deploymentDetails.replicas ? "Running" : "Updating"}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">副本数</Label>
                        <div className="mt-1 text-lg font-semibold">
                          {deploymentDetails.ready_replicas}/{deploymentDetails.replicas}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">可用副本</Label>
                        <div className="mt-1">{deploymentDetails.available_replicas}</div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">更新副本</Label>
                        <div className="mt-1">{deploymentDetails.updated_replicas}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">年龄</Label>
                        <div className="mt-1">{deploymentDetails.age}</div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">策略</Label>
                        <div className="mt-1">{deploymentDetails.strategy.type}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 容器信息 */}
                <Card>
                  <CardHeader>
                    <CardTitle>容器信息</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {deploymentDetails.spec.template.spec.containers.map((container: any, index: number) => (
                      <div key={index} className="mb-4 last:mb-0">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{container.name}</h4>
                          <Badge variant="outline">{container.image}</Badge>
                        </div>
                        {container.resources && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {container.resources.requests && (
                              <div>请求: CPU {container.resources.requests.cpu || '未设置'}, 内存 {container.resources.requests.memory || '未设置'}</div>
                            )}
                            {container.resources.limits && (
                              <div>限制: CPU {container.resources.limits.cpu || '未设置'}, 内存 {container.resources.limits.memory || '未设置'}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* 标签和选择器 */}
                <Card>
                  <CardHeader>
                    <CardTitle>标签</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(deploymentDetails.labels).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(deploymentDetails.labels).map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">无标签</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>选择器</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(deploymentDetails.selector).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(deploymentDetails.selector).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">无选择器</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    无法获取部署信息
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    无法获取部署的详细信息
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>


          {/* 配置标签页 */}
          <TabsContent value="config" className="space-y-6">
            <DeploymentConfigTab
              deploymentDetails={deploymentDetails}
              clusterId={clusterId}
              onUpdate={fetchDeploymentData}
            />
          </TabsContent>

          {/* YAML标签页 */}
          <TabsContent value="yaml" className="space-y-6">
            <DeploymentYamlTab
              namespace={resolvedParams.namespace}
              deployment={resolvedParams.deployment}
              clusterId={clusterId}
            />
          </TabsContent>

          {/* 服务标签页 */}
          <TabsContent value="services" className="space-y-6">
            <DeploymentServicesTab
              namespace={resolvedParams.namespace}
              deployment={resolvedParams.deployment}
              clusterId={clusterId}
            />
          </TabsContent>

          {/* Pods标签页 */}
          <TabsContent value="pods" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : deploymentPods.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    暂无Pods
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    该部署当前没有运行中的Pods
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {deploymentPods.map((pod) => (
                  <Card key={pod.name}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <CardTitle className="text-lg">{pod.name}</CardTitle>
                          <Badge variant={
                            pod.status === 'Running' ? 'default' :
                            pod.status === 'Pending' ? 'secondary' :
                            pod.status === 'Succeeded' ? 'default' :
                            pod.status === 'Failed' ? 'destructive' : 'outline'
                          }>
                            {pod.status}
                          </Badge>
                        </div>
                        <Link href={`/pods/${pod.namespace}/${pod.name}?cluster_id=${clusterId}`}>
                          <Button variant="outline" size="sm">
                            查看详情
                          </Button>
                        </Link>
                      </div>
                      <CardDescription>
                        节点: {pod.node_name || '未调度'} •
                        容器: {pod.ready_containers} •
                        重启: {pod.restarts} •
                        年龄: {pod.age}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 伸缩标签页 */}
          <TabsContent value="scaling" className="space-y-6">
            <DeploymentScalingTab
              deploymentDetails={deploymentDetails}
              clusterId={clusterId}
              onScale={fetchDeploymentData}
            />
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
