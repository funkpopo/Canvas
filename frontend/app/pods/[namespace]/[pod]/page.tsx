"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Activity, Cpu, MemoryStick, Loader2, RefreshCw, AlertCircle, Square, Server, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { podApi } from "@/lib/api";

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
  const resolvedParams = use(params);
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
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
  const clusterId = searchParams.get('cluster_id');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && clusterId) {
      fetchPodDetails();
      fetchMetrics();
    }
  }, [isAuthenticated, clusterId, timeRange, resolvedParams.namespace, resolvedParams.pod]);

  // 如果没有clusterId，显示错误信息
  if (!clusterId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href="/pods" className="flex items-center">
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">返回Pod列表</span>
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
                无法获取Pod详情：缺少集群ID参数
              </p>
              <Link href="/pods">
                <Button>返回Pod列表</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const fetchPodDetails = async () => {
    try {
      const result = await podApi.getPod(
        parseInt(clusterId!),
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
      title: "删除Pod",
      description: `确定要删除Pod "${podDetails.name}" 吗？此操作不可撤销。`,
      onConfirm: () => performDeletePod(),
      showForceOption: true,
      forceOption: false,
    });
  };

  const handleForceOptionChange = (checked: boolean) => {
    setConfirmDialog(prev => ({ ...prev, forceOption: checked }));
  };

  const performDeletePod = async () => {
    if (!podDetails || !clusterId) return;

    try {
      const result = await podApi.deletePod(
        parseInt(clusterId),
        podDetails.namespace,
        podDetails.name
      );

      if (!result.error) {
        const deleteType = confirmDialog.forceOption ? "强制" : "正常";
        toast.success(`Pod${deleteType}删除成功`);
        // 删除成功后返回Pod列表页面
        router.push('/pods');
      } else {
        toast.error("删除Pod失败");
      }
    } catch (error) {
      console.error("删除Pod出错:", error);
      toast.error("删除Pod时发生错误");
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
    <div className="min-h-screen bg-background">
      {/* Main Header */}
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
                退出登录
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
              <Link href="/pods" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回Pod列表</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="时间范围" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5m">5分钟</SelectItem>
                  <SelectItem value="10m">10分钟</SelectItem>
                  <SelectItem value="30m">30分钟</SelectItem>
                  <SelectItem value="1h">1小时</SelectItem>
                  <SelectItem value="6h">6小时</SelectItem>
                  <SelectItem value="24h">24小时</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { fetchPodDetails(); fetchMetrics(); }} disabled={isLoading || isMetricsLoading}>
                {isLoading || isMetricsLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                刷新
              </Button>
              <Button variant="destructive" onClick={handleDeletePod}>
                <Square className="h-4 w-4 mr-2" />
                删除Pod
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : podDetails ? (
          <div className="space-y-8">
            {/* Pod基本信息 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">{podDetails.name}</CardTitle>
                    <CardDescription>
                      {podDetails.namespace} • {podDetails.node_name || "未调度"} • {podDetails.age}
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusBadgeVariant(podDetails.status)} className="text-lg px-3 py-1">
                    {podDetails.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">容器:</span>
                    <span className="ml-2">{podDetails.ready_containers}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">重启次数:</span>
                    <span className="ml-2">{podDetails.restarts}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">节点:</span>
                    <span className="ml-2">{podDetails.node_name || "未调度"}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">运行时间:</span>
                    <span className="ml-2">{podDetails.age}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 监控图表 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* CPU使用率图表 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Cpu className="h-5 w-5 mr-2" />
                    CPU使用率
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isMetricsLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={metricsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" />
                        <YAxis domain={[0, 120]} />
                        <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'CPU使用率']} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="cpu"
                          stroke="#71717a"
                          strokeWidth={2}
                          dot={false}
                          name="CPU使用率 (%)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* 内存使用图表 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MemoryStick className="h-5 w-5 mr-2" />
                    内存使用
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isMetricsLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={metricsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" />
                        <YAxis domain={[0, 'dataMax + 50']} />
                        <Tooltip formatter={(value) => [`${Number(value).toFixed(0)} MB`, '内存使用']} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="memory"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                          name="内存使用 (MB)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 容器信息 */}
            <Card>
              <CardHeader>
                <CardTitle>容器信息</CardTitle>
              </CardHeader>
              <CardContent>
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
                              <span className="text-gray-600 dark:text-gray-400">请求:</span>
                              <span className="ml-2">
                                CPU: {container.resources.requests.cpu || '未设置'},
                                内存: {container.resources.requests.memory || '未设置'}
                              </span>
                            </div>
                          )}
                          {container.resources.limits && (
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">限制:</span>
                              <span className="ml-2">
                                CPU: {container.resources.limits.cpu || '未设置'},
                                内存: {container.resources.limits.memory || '未设置'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 事件信息 */}
            {podDetails.events && podDetails.events.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>最近事件</CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                未找到Pod信息
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                无法获取Pod详情信息
              </p>
            </CardContent>
          </Card>
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
