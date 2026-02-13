"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Loader2, RefreshCw, AlertCircle, Square } from "lucide-react";
import { ClusterContextRequired } from "@/components/ClusterContextRequired";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resolveClusterContext } from "@/lib/cluster-context-resolver";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { podApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";

const PodMetricsCharts = dynamic(
  () => import("@/components/pods/PodMetricsCharts").then((m) => m.PodMetricsCharts),
  { ssr: false, loading: () => <div className="h-64" /> }
);

interface PodDetails {
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  age: string;
  restarts: number;
  ready_containers: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  containers: Array<{
    name: string;
    image: string;
    status: string;
    ports?: Array<{
      containerPort: number;
      protocol: string;
    }>;
    resources?: {
      requests?: {
        cpu?: string;
        memory?: string;
      };
      limits?: {
        cpu?: string;
        memory?: string;
      };
    };
  }>;
  volumes: Array<{
    name: string;
    type: string;
  }>;
  events: Array<{
    type: string;
    reason: string;
    message: string;
    timestamp: string;
  }>;
  cluster_id: number;
  cluster_name: string;
}

interface MetricsData {
  timestamp: string;
  cpu: number;
  memory: number;
}

export default function PodDetailsPage({ params }: { params: Promise<{ namespace: string; pod: string }> }) {
  const t = useTranslations("podDetails");
  const tCommon = useTranslations("common");

  const resolvedParams = use(params);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { runWithFeedback } = useAsyncActionFeedback();
  const [podDetails, setPodDetails] = useState<PodDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<MetricsData[]>([]);
  const [timeRange, setTimeRange] = useState("10m");
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    showForceOption: false,
    forceOption: false,
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
      setPodDetails(null);
      setMetricsData([]);
      return;
    }
    fetchPodDetails();
    fetchMetrics();
  }, [isAuthenticated, isClusterContextMissing, effectiveClusterId, timeRange, resolvedParams.namespace, resolvedParams.pod]);

  const fetchPodDetails = async () => {
    if (!effectiveClusterId) return;
    try {
      const result = await podApi.getPod(
        effectiveClusterId,
        resolvedParams.namespace,
        resolvedParams.pod
      );

      if (result.data) {
        setPodDetails(result.data as unknown as PodDetails);
      } else {
        console.error("获取Pod详情失败");
      }
    } catch (error) {
      console.error("获取Pod详情出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetrics = async () => {
    setIsMetricsLoading(true);
    try {
      // 模拟获取监控数据
      // 实际应该调用后端API获取真实的监控数据
      const mockData: MetricsData[] = [];
      const now = new Date();

      for (let i = 0; i < 60; i++) {
        const timestamp = new Date(now.getTime() - i * 1000 * 10); // 每10秒一个数据点
        mockData.unshift({
          timestamp: timestamp.toLocaleTimeString(),
          cpu: Math.random() * 100 + 10, // 10-110% 的随机CPU使用率
          memory: Math.random() * 512 + 100, // 100-612MB 的随机内存使用
        });
      }

      setMetricsData(mockData);
    } catch (error) {
      console.error("获取监控数据出错:", error);
    } finally {
      setIsMetricsLoading(false);
    }
  };

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
  };

  const handleDeletePod = () => {
    if (!podDetails) return;

    setConfirmDialog({
      open: true,
      title: t("deleteTitle"),
      description: t("deleteDescription", { name: podDetails.name }),
      onConfirm: () => performDeletePod(),
      showForceOption: true,
      forceOption: false,
    });
  };

  const handleForceOptionChange = (checked: boolean) => {
    setConfirmDialog(prev => ({ ...prev, forceOption: checked }));
  };

  const performDeletePod = async () => {
    if (!podDetails) return;
    const clusterForRequest = effectiveClusterId ?? podDetails.cluster_id;

    try {
      const deleteType = confirmDialog.forceOption ? t("deleteTypeForce") : t("deleteTypeNormal");
      await runWithFeedback(
        async () => {
          const result = await podApi.deletePod(
            clusterForRequest,
            podDetails.namespace,
            podDetails.name
          );

          if (result.error) {
            throw new Error(result.error);
          }

          router.push("/pods");
        },
        {
          loading: t("deleteLoading", { deleteType }),
          success: t("deleteSuccess", { deleteType }),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("删除Pod出错:", error);
    }
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
    <div>
      {/* Actions bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t("timeRange")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">{t("range5m")}</SelectItem>
              <SelectItem value="10m">{t("range10m")}</SelectItem>
              <SelectItem value="30m">{t("range30m")}</SelectItem>
              <SelectItem value="1h">{t("range1h")}</SelectItem>
              <SelectItem value="6h">{t("range6h")}</SelectItem>
              <SelectItem value="24h">{t("range24h")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { fetchPodDetails(); fetchMetrics(); }} disabled={isLoading || isMetricsLoading}>
            {isLoading || isMetricsLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t("refresh")}
          </Button>
          <Button variant="destructive" onClick={handleDeletePod}>
            <Square className="h-4 w-4 mr-2" />
            {t("deletePod")}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div>
        {isClusterContextMissing ? (
          <ClusterContextRequired />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">{tCommon("loading")}</span>
          </div>
        ) : podDetails ? (
          <div className="space-y-6">
            {/* Pod basic info */}
            <section className="py-4 border-b last:border-b-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-2xl font-medium">{podDetails.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {podDetails.namespace} • {podDetails.node_name || t("notScheduled")} • {podDetails.age}
                  </p>
                </div>
                <Badge variant={getStatusBadgeVariant(podDetails.status)} className="text-lg px-3 py-1">
                  {podDetails.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">{t("containersLabel")}</span>
                  <span className="ml-2">{podDetails.ready_containers}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">{t("restartsLabel")}</span>
                  <span className="ml-2">{podDetails.restarts}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">{t("nodeLabel")}</span>
                  <span className="ml-2">{podDetails.node_name || t("notScheduled")}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">{t("ageLabel")}</span>
                  <span className="ml-2">{podDetails.age}</span>
                </div>
              </div>
            </section>

            {/* Metrics charts */}
            <PodMetricsCharts metricsData={metricsData} isLoading={isMetricsLoading} />

            {/* Containers */}
            <section className="py-4 border-b last:border-b-0">
              <h3 className="text-sm font-medium mb-3">{t("containersTitle")}</h3>
              <div className="space-y-4">
                {podDetails.containers.map((container, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{container.name}</h4>
                      <Badge variant={container.status === "Running" ? "default" : "secondary"}>
                        {container.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{container.image}</p>
                    {container.resources && (
                      <div className="text-sm space-y-1">
                        {container.resources.requests && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">{t("requestsLabel")}</span>
                            <span className="ml-2">
                              {t("resourceCpu", { value: container.resources.requests.cpu || t("notSet") })},
                              {t("resourceMemory", { value: container.resources.requests.memory || t("notSet") })}
                            </span>
                          </div>
                        )}
                        {container.resources.limits && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">{t("limitsLabel")}</span>
                            <span className="ml-2">
                              {t("resourceCpu", { value: container.resources.limits.cpu || t("notSet") })},
                              {t("resourceMemory", { value: container.resources.limits.memory || t("notSet") })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Events */}
            {podDetails.events && podDetails.events.length > 0 && (
              <section className="py-4 border-b last:border-b-0">
                <h3 className="text-sm font-medium mb-3">{t("recentEvents")}</h3>
                <div className="space-y-2">
                  {podDetails.events.slice(0, 10).map((event, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <AlertCircle className={`h-5 w-5 mt-0.5 ${
                        event.type === 'Warning' ? 'text-yellow-500' :
                        event.type === 'Normal' ? 'text-green-500' : 'text-zinc-500'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge variant={event.type === 'Warning' ? 'destructive' : 'default'}>
                            {event.type}
                          </Badge>
                          <span className="text-sm font-medium">{event.reason}</span>
                          <span className="text-xs text-gray-500">{event.timestamp}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{event.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {t("podNotFound")}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t("podNotFoundDescription")}
            </p>
          </div>
        )}
      </div>

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
