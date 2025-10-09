"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Activity, Loader2, RefreshCw, Users, Settings, FileText, Database, Cpu, MemoryStick, AlertCircle } from "lucide-react";

interface NamespaceResources {
  cpu_requests: string;
  cpu_limits: string;
  memory_requests: string;
  memory_limits: string;
  pods: number;
  persistent_volume_claims: number;
  config_maps: number;
  secrets: number;
  services: number;
}

interface Deployment {
  name: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  updated_replicas: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  status: string;
}

interface Service {
  name: string;
  type: string;
  cluster_ip: string;
  external_ip?: string;
  ports: Array<{
    port: number;
    target_port: number | string;
    protocol: string;
  }>;
  selector: Record<string, string>;
  age: string;
  labels: Record<string, string>;
}

interface CRD {
  name: string;
  kind: string;
  api_version: string;
  namespace: string;
  age: string;
  labels: Record<string, string>;
}

export default function NamespaceDetailsPage({ params }: { params: Promise<{ namespace: string }> }) {
  const resolvedParams = use(params);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [resources, setResources] = useState<NamespaceResources | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [crds, setCrds] = useState<CRD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
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
      fetchNamespaceData();
    }
  }, [isAuthenticated, clusterId, resolvedParams.namespace, activeTab]);

  // 如果没有clusterId，显示错误信息
  if (!clusterId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href="/namespaces" className="flex items-center">
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">返回命名空间列表</span>
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
                无法获取命名空间详情：缺少集群ID参数
              </p>
              <Link href="/namespaces">
                <Button>返回命名空间列表</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const fetchNamespaceData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");

      if (activeTab === "overview") {
        // 获取资源使用情况
        const resourcesResponse = await fetch(
          `http://localhost:8000/api/namespaces/${resolvedParams.namespace}/resources?cluster_id=${clusterId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          }
        );

        if (resourcesResponse.ok) {
          const resourcesData = await resourcesResponse.json();
          setResources(resourcesData);
        }
      } else if (activeTab === "deployments") {
        // 获取部署
        const deploymentsResponse = await fetch(
          `http://localhost:8000/api/namespaces/${resolvedParams.namespace}/deployments?cluster_id=${clusterId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          }
        );

        if (deploymentsResponse.ok) {
          const deploymentsData = await deploymentsResponse.json();
          setDeployments(deploymentsData);
        }
      } else if (activeTab === "services") {
        // 获取服务
        const servicesResponse = await fetch(
          `http://localhost:8000/api/namespaces/${resolvedParams.namespace}/services?cluster_id=${clusterId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          }
        );

        if (servicesResponse.ok) {
          const servicesData = await servicesResponse.json();
          setServices(servicesData);
        }
      } else if (activeTab === "crds") {
        // 获取CRD
        const crdsResponse = await fetch(
          `http://localhost:8000/api/namespaces/${resolvedParams.namespace}/crds?cluster_id=${clusterId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          }
        );

        if (crdsResponse.ok) {
          const crdsData = await crdsResponse.json();
          setCrds(crdsData);
        }
      }
    } catch (error) {
      console.error("获取命名空间数据出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAge = (timestamp: string) => {
    if (!timestamp) return "未知";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays}天前`;
    if (diffHours > 0) return `${diffHours}小时前`;
    if (diffMinutes > 0) return `${diffMinutes}分钟前`;
    return "刚刚";
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
              <Link href="/namespaces" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回命名空间列表</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" onClick={fetchNamespaceData} disabled={isLoading}>
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
            命名空间详情: {resolvedParams.namespace}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            查看命名空间中的资源和工作负载
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="deployments">部署</TabsTrigger>
            <TabsTrigger value="services">服务</TabsTrigger>
            <TabsTrigger value="crds">自定义资源</TabsTrigger>
          </TabsList>

          {/* 概览标签页 */}
          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : resources ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pods</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.pods}</div>
                    <p className="text-xs text-muted-foreground">
                      运行中的Pods数量
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Services</CardTitle>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.services}</div>
                    <p className="text-xs text-muted-foreground">
                      服务数量
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">ConfigMaps</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.config_maps}</div>
                    <p className="text-xs text-muted-foreground">
                      配置映射数量
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Secrets</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.secrets}</div>
                    <p className="text-xs text-muted-foreground">
                      密钥数量
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">PVCs</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.persistent_volume_claims}</div>
                    <p className="text-xs text-muted-foreground">
                      持久卷声明数量
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">CPU资源</CardTitle>
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.cpu_requests}</div>
                    <p className="text-xs text-muted-foreground">
                      请求: {resources.cpu_requests}, 限制: {resources.cpu_limits}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">内存资源</CardTitle>
                    <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{resources.memory_requests}</div>
                    <p className="text-xs text-muted-foreground">
                      请求: {resources.memory_requests}, 限制: {resources.memory_limits}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    无法获取资源信息
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    无法获取命名空间的资源使用情况
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 部署标签页 */}
          <TabsContent value="deployments" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : deployments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    暂无部署
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    该命名空间中没有部署资源
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {deployments.map((deployment) => (
                  <Card key={deployment.name}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{deployment.name}</CardTitle>
                        <Badge variant={deployment.status === "Running" ? "default" : "secondary"}>
                          {deployment.status}
                        </Badge>
                      </div>
                      <CardDescription>
                        副本: {deployment.ready_replicas}/{deployment.replicas} •
                        可用: {deployment.available_replicas} •
                        更新: {deployment.updated_replicas} •
                        创建时间: {formatAge(deployment.age)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <h4 className="text-sm font-medium mb-1">镜像:</h4>
                          <div className="flex flex-wrap gap-1">
                            {deployment.images.map((image, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {image}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {Object.keys(deployment.labels).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">标签:</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(deployment.labels).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 服务标签页 */}
          <TabsContent value="services" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : services.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Settings className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    暂无服务
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    该命名空间中没有服务资源
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {services.map((service) => (
                  <Card key={service.name}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{service.name}</CardTitle>
                        <Badge variant="outline">{service.type}</Badge>
                      </div>
                      <CardDescription>
                        集群IP: {service.cluster_ip} •
                        {service.external_ip && `外部IP: ${service.external_ip} • `}
                        创建时间: {formatAge(service.age)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <h4 className="text-sm font-medium mb-1">端口:</h4>
                          <div className="flex flex-wrap gap-1">
                            {service.ports.map((port, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {port.port}:{port.target_port} ({port.protocol})
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {Object.keys(service.selector).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">选择器:</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(service.selector).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Object.keys(service.labels).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">标签:</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(service.labels).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* CRD标签页 */}
          <TabsContent value="crds" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : crds.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    暂无自定义资源
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    该命名空间中没有自定义资源
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {crds.map((crd, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{crd.name}</CardTitle>
                        <Badge variant="outline">{crd.kind}</Badge>
                      </div>
                      <CardDescription>
                        API版本: {crd.api_version} •
                        创建时间: {formatAge(crd.age)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(crd.labels).length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">标签:</h4>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(crd.labels).map(([key, value]) => (
                              <Badge key={key} variant="secondary" className="text-xs">
                                {key}: {value}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
