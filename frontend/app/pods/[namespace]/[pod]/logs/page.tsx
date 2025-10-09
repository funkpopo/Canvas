"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, RefreshCw, Terminal } from "lucide-react";

export default function PodLogsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const namespace = params.namespace as string;
  const podName = params.pod as string;
  const clusterId = searchParams.get('cluster_id');

  const [logs, setLogs] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [tailLines, setTailLines] = useState(100);
  const [availableContainers, setAvailableContainers] = useState<string[]>([]);

  useEffect(() => {
    if (namespace && podName && clusterId) {
      fetchPodDetails();
    }
  }, [namespace, podName, clusterId]);

  useEffect(() => {
    if (namespace && podName && clusterId) {
      fetchLogs();
    }
  }, [namespace, podName, clusterId, selectedContainer, tailLines]);

  const fetchPodDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/pods/${namespace}/${podName}?cluster_id=${clusterId}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const podDetails = await response.json();
        const containers = (podDetails.containers as Array<{name: string}>)?.map((c) => c.name) || [];
        setAvailableContainers(containers);
        if (containers.length > 0 && !selectedContainer) {
          setSelectedContainer(containers[0]);
        }
      }
    } catch (error) {
      console.error("获取Pod详情失败:", error);
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const url = new URL(`http://localhost:8000/api/pods/${namespace}/${podName}/logs`);
      url.searchParams.set('cluster_id', clusterId!);
      if (selectedContainer && selectedContainer.trim()) {
        url.searchParams.set('container', selectedContainer.trim());
      }
      url.searchParams.set('tail_lines', tailLines.toString());

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const logsText = await response.text();
        setLogs(logsText || "暂无日志内容");
      } else {
        let errorMessage = `获取日志失败 (${response.status}): ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage += ` - ${errorData.detail}`;
          }
        } catch (e) {
          // 忽略JSON解析错误
        }
        setLogs(errorMessage);
        console.error("日志API响应错误:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("获取日志出错:", error);
      setLogs("获取日志时发生网络错误，请检查网络连接");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${podName}-${namespace}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatLogs = (logs: string) => {
    return logs.split('\n').map((line, index) => (
      <div key={index} className="font-mono text-sm whitespace-pre-wrap break-all">
        {line || '\n'}
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Pod日志: {podName}
          </h1>
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
      </div>
    </div>
  );
}
