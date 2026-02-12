"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, RefreshCw, Terminal, Server, LogOut, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resolveClusterContext, withClusterId } from "@/lib/cluster-context-resolver";
import { podApi } from "@/lib/api";

export default function PodLogsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const namespace = params.namespace as string;
  const podName = params.pod as string;
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
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();

  const [logs, setLogs] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [tailLines, setTailLines] = useState(100);
  const [availableContainers, setAvailableContainers] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && namespace && podName) {
      fetchPodDetails();
    }
  }, [isAuthenticated, namespace, podName, effectiveClusterId]);

  useEffect(() => {
    if (isAuthenticated && namespace && podName) {
      fetchLogs();
    }
  }, [isAuthenticated, namespace, podName, effectiveClusterId, selectedContainer, tailLines]);

  const fetchPodDetails = async () => {
    try {
      const response = await podApi.getPod(effectiveClusterId ?? undefined, namespace, podName);
      if (response.data) {
        const containers =
          (response.data.containers as Array<{ name: string }>)?.map((container) => container.name) || [];
        setAvailableContainers(containers);
        if (containers.length > 0 && !selectedContainer) {
          setSelectedContainer(containers[0]);
        }
        return;
      }

      if (response.error) {
        console.error("获取Pod详情失败:", response.error);
      }
    } catch (error) {
      console.error("获取Pod详情失败:", error);
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const response = await podApi.getPodLogs({
        clusterId: effectiveClusterId,
        namespace,
        podName,
        container: selectedContainer || undefined,
        tailLines,
      });

      if (response.data !== undefined) {
        setLogs(response.data || "暂无日志内容");
        return;
      }

      const message = response.error || "未知错误";
      let hint = "";
      if (message.includes("not found")) {
        hint = "。请确认 Pod 存在并且容器名称正确。";
      } else if (message.includes("permission")) {
        hint = "。当前账号可能缺少读取日志权限。";
      } else if (message.includes("no active cluster")) {
        hint = "。请先在页面顶部选择一个可用集群。";
      }
      setLogs(`获取日志失败: ${message}${hint}`);
    } catch (error) {
      console.error("获取日志出错:", error);
      setLogs("获取日志时发生网络错误，请检查网络连接");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadLogs = () => {
    try {
      const blob = new Blob([logs], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${podName}-${namespace}-logs.txt`;
      a.style.display = 'none';

      // Check if document.body exists before manipulating
      if (document.body) {
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载日志失败:', error);
    }
  };

  const formatLogs = (logs: string) => {
    return logs.split('\n').map((line, index) => (
      <div key={index} className="font-mono text-sm whitespace-pre-wrap break-all">
        {line || '\n'}
      </div>
    ));
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

      {/* Sub-header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href={withClusterId(`/pods/${namespace}/${podName}`, effectiveClusterId)} className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回Pod详情</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Pod日志: {podName}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            命名空间: {namespace}
          </p>
        </div>

        {/* 控制面板 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Terminal className="h-5 w-5 mr-2" />
              日志查看器
            </CardTitle>
            <CardDescription>
              查看Pod容器的实时日志输出
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-center">
              {availableContainers.length > 1 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">容器:</label>
                  <Select value={selectedContainer} onValueChange={setSelectedContainer}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableContainers.map((container) => (
                        <SelectItem key={container} value={container}>
                          {container}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">行数:</label>
                <Select value={tailLines.toString()} onValueChange={(value) => setTailLines(parseInt(value))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50行</SelectItem>
                    <SelectItem value="100">100行</SelectItem>
                    <SelectItem value="200">200行</SelectItem>
                    <SelectItem value="500">500行</SelectItem>
                    <SelectItem value="1000">1000行</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" onClick={fetchLogs} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                刷新
              </Button>

              <Button variant="outline" onClick={downloadLogs} disabled={!logs}>
                <Download className="h-4 w-4 mr-2" />
                下载日志
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 日志显示区域 */}
        <Card>
          <CardContent className="p-0">
            <div className="bg-black text-green-400 p-4 rounded-lg min-h-96 max-h-96 overflow-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin mr-2" />
                  <span>加载日志中...</span>
                </div>
              ) : logs ? (
                <div className="font-mono text-sm">
                  {formatLogs(logs)}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  暂无日志内容
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
