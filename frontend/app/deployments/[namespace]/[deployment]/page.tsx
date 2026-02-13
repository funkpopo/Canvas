"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Activity, Loader2, RefreshCw, RotateCcw, Trash2, Settings, Server, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import ClusterSelector from "@/components/ClusterSelector";
import { ClusterContextRequired } from "@/components/ClusterContextRequired";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resolveClusterContext, withClusterId } from "@/lib/cluster-context-resolver";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import DeploymentConfigTab from "@/components/DeploymentConfigTab";
import DeploymentYamlTab from "@/components/DeploymentYamlTab";
import DeploymentServicesTab from "@/components/DeploymentServicesTab";
import DeploymentScalingTab from "@/components/DeploymentScalingTab";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { deploymentApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";

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
  const t = useTranslations("deploymentDetails");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");

  const resolvedParams = use(params);
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { runWithFeedback } = useAsyncActionFeedback();
  const [deploymentDetails, setDeploymentDetails] = useState<DeploymentDetails | null>(null);
  const [deploymentPods, setDeploymentPods] = useState<DeploymentPod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isScaleDialogOpen, setIsScaleDialogOpen] = useState(false);
  const [newReplicas, setNewReplicas] = useState(0);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeCluster } = useCluster();
  const clusterContext = useMemo(
    () =>
      resolveClusterContext({
        clusterIdFromUrl: searchParams.get("cluster_id"),
        activeClusterId: activeCluster?.id ?? null,
      }),
    [searchParams, activeCluster?.id]
  );
  const effectiveClusterId = clusterContext.clusterId;
  const isClusterContextMissing = clusterContext.source === "none";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isClusterContextMissing) {
      setIsLoading(false);
      setDeploymentDetails(null);
      setDeploymentPods([]);
      return;
    }
    fetchDeploymentData();
  }, [isAuthenticated, isClusterContextMissing, effectiveClusterId, resolvedParams.namespace, resolvedParams.deployment, activeTab]);

  const fetchDeploymentData = async () => {
    if (!effectiveClusterId) return;
    setIsLoading(true);
    try {
      if (activeTab === "overview") {
        // 获取部署详情
        const result = await deploymentApi.getDeployment(
          effectiveClusterId,
          resolvedParams.namespace,
          resolvedParams.deployment
        );

        if (result.data) {
          setDeploymentDetails(result.data as unknown as DeploymentDetails);
          setNewReplicas((result.data as unknown as DeploymentDetails).replicas);
        }
      } else if (activeTab === "pods") {
        // 获取部署管理的Pods
        const result = await deploymentApi.getDeploymentPods(
          effectiveClusterId,
          resolvedParams.namespace,
          resolvedParams.deployment
        );

        if (result.data) {
          setDeploymentPods(result.data as unknown as DeploymentPod[]);
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
      await runWithFeedback(
        async () => {
          const result = await deploymentApi.scaleDeployment(
            effectiveClusterId ?? deploymentDetails.cluster_id,
            resolvedParams.namespace,
            resolvedParams.deployment,
            newReplicas
          );
          if (!result.data) {
            throw new Error(result.error || t("scaleErrorUnknown"));
          }
          setIsScaleDialogOpen(false);
          await fetchDeploymentData();
        },
        {
          loading: t("scaleLoading"),
          success: t("scaleSuccess"),
          error: t("scaleError"),
        }
      );
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
      await runWithFeedback(
        async () => {
          const result = await deploymentApi.restartDeployment(
            effectiveClusterId ?? deploymentDetails.cluster_id,
            resolvedParams.namespace,
            resolvedParams.deployment
          );
          if (!result.data) {
            throw new Error(result.error || t("restartErrorUnknown"));
          }
          await fetchDeploymentData();
        },
        {
          loading: t("restartLoading"),
          success: t("restartSuccess"),
          error: t("restartError"),
        }
      );
    } catch (error) {
      console.error("重启出错:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleDelete = () => {
    if (!deploymentDetails) return;

    setConfirmDialog({
      open: true,
      title: t("deleteTitle"),
      description: t("deleteDescription", { name: resolvedParams.deployment }),
      onConfirm: () => performDelete(),
    });
  };

  const performDelete = async () => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const result = await deploymentApi.deleteDeployment(
            effectiveClusterId ?? deploymentDetails?.cluster_id,
            resolvedParams.namespace,
            resolvedParams.deployment
          );
          if (result.error) {
            throw new Error(result.error);
          }
          router.push(withClusterId(`/namespaces/${resolvedParams.namespace}`, effectiveClusterId));
        },
        {
          loading: t("deleteLoading"),
          success: t("deleteSuccess"),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("删除出错:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  if (authLoading) {
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
              <LanguageToggle />
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                {tAuth("logout")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Sub-header with actions */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href={withClusterId(`/namespaces/${resolvedParams.namespace}`, effectiveClusterId)} className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">{t("backToNamespace")}</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2">
              <Dialog open={isScaleDialogOpen} onOpenChange={setIsScaleDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    {t("scaleAction")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("scaleDialogTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("scaleDialogDescription", { deployment: resolvedParams.deployment })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="replicas" className="text-right">
                        {t("replicasLabel")}
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
                      {t("confirmScale")}
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
                {t("restartAction")}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isOperationLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {tCommon("delete")}
              </Button>

              <Button variant="outline" onClick={fetchDeploymentData} disabled={isLoading}>
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
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title", { deployment: resolvedParams.deployment })}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("meta", { namespace: resolvedParams.namespace, cluster: deploymentDetails?.cluster_name ?? "-" })}
          </p>
        </div>

        {isClusterContextMissing ? (
          <ClusterContextRequired />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">{t("tabOverview")}</TabsTrigger>
            <TabsTrigger value="config">{t("tabConfig")}</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="services">{t("tabServices")}</TabsTrigger>
            <TabsTrigger value="scaling">{t("tabScaling")}</TabsTrigger>
            <TabsTrigger value="pods">Pods</TabsTrigger>
          </TabsList>

          {/* 概览标签页 */}
          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : deploymentDetails ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 基本信息 */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t("basicInfoTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">{t("statusLabel")}</Label>
                        <div className="mt-1">
                          <Badge variant={deploymentDetails.ready_replicas === deploymentDetails.replicas ? "default" : "secondary"}>
                            {deploymentDetails.ready_replicas === deploymentDetails.replicas ? t("statusRunning") : t("statusUpdating")}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">{t("replicasLabel")}</Label>
                        <div className="mt-1 text-lg font-semibold">
                          {deploymentDetails.ready_replicas}/{deploymentDetails.replicas}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">{t("availableReplicasLabel")}</Label>
                        <div className="mt-1">{deploymentDetails.available_replicas}</div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">{t("updatedReplicasLabel")}</Label>
                        <div className="mt-1">{deploymentDetails.updated_replicas}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">{t("ageLabel")}</Label>
                        <div className="mt-1">{deploymentDetails.age}</div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">{t("strategyLabel")}</Label>
                        <div className="mt-1">{deploymentDetails.strategy?.type || 'RollingUpdate'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 容器信息 */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t("containersTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {deploymentDetails.spec?.template?.spec?.containers ? (
                      deploymentDetails.spec.template.spec.containers.map((container: any, index: number) => (
                        <div key={index} className="mb-4 last:mb-0">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{container.name}</h4>
                            <Badge variant="outline">{container.image}</Badge>
                          </div>
                          {container.resources && (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {container.resources.requests && (
                                <div>{t("requestsSummary", { cpu: container.resources.requests.cpu || t("notSet"), memory: container.resources.requests.memory || t("notSet") })}</div>
                              )}
                              {container.resources.limits && (
                                <div>{t("limitsSummary", { cpu: container.resources.limits.cpu || t("notSet"), memory: container.resources.limits.memory || t("notSet") })}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">{t("containerInfoUnavailable")}</p>
                    )}
                  </CardContent>
                </Card>

                {/* 标签和选择器 */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t("labelsTitle")}</CardTitle>
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
                      <p className="text-gray-500">{t("noLabels")}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("selectorsTitle")}</CardTitle>
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
                      <p className="text-gray-500">{t("noSelectors")}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {t("loadDetailsFailedTitle")}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {t("loadDetailsFailedDescription")}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>


          {/* 配置标签页 */}
          <TabsContent value="config" className="space-y-6">
            <DeploymentConfigTab
              deploymentDetails={deploymentDetails}
              clusterId={effectiveClusterId ? String(effectiveClusterId) : null}
              onUpdate={fetchDeploymentData}
            />
          </TabsContent>

          {/* YAML标签页 */}
          <TabsContent value="yaml" className="space-y-6">
            <DeploymentYamlTab
              namespace={resolvedParams.namespace}
              deployment={resolvedParams.deployment}
              clusterId={effectiveClusterId ? String(effectiveClusterId) : null}
            />
          </TabsContent>

          {/* 服务标签页 */}
          <TabsContent value="services" className="space-y-6">
            <DeploymentServicesTab
              namespace={resolvedParams.namespace}
              deployment={resolvedParams.deployment}
              clusterId={effectiveClusterId ? String(effectiveClusterId) : null}
            />
          </TabsContent>

          {/* Pods标签页 */}
          <TabsContent value="pods" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : deploymentPods.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {t("noPodsTitle")}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {t("noPodsDescription")}
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
                        <Link href={withClusterId(`/pods/${pod.namespace}/${pod.name}`, effectiveClusterId)}>
                          <Button variant="outline" size="sm">
                            {t("viewDetails")}
                          </Button>
                        </Link>
                      </div>
                      <CardDescription>
                        {t("podMeta", {
                          node: pod.node_name || t("notScheduled"),
                          containers: pod.ready_containers,
                          restarts: pod.restarts,
                          age: pod.age,
                        })}
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
              clusterId={effectiveClusterId ? String(effectiveClusterId) : null}
              onScale={fetchDeploymentData}
            />
          </TabsContent>

          </Tabs>
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
