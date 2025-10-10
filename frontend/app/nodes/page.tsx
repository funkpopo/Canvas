"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Server, Cpu, MemoryStick, HardDrive, Loader2 } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";

interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  age: string;
  version: string;
  internal_ip: string | null;
  external_ip: string | null;
  cpu_capacity: string;
  memory_capacity: string;
  pods_capacity: string;
  cpu_usage?: string;
  memory_usage?: string;
  pods_usage?: string;
  cluster_id: number;
  cluster_name: string;
}

function NodesPageContent() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/api/nodes", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNodes(data);
      } else {
        console.error("获取节点列表失败");
      }
    } catch (error) {
      console.error("获取节点列表出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Ready":
        return "default";
      case "NotReady":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getRoleDisplay = (roles: string[]) => {
    if (roles.includes("master")) return "Master";
    if (roles.includes("worker")) return "Worker";
    return "Node";
  };

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
            <Button variant="outline" onClick={fetchNodes} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Server className="h-4 w-4 mr-2" />
              )}
              刷新
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            节点管理
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            查看和管理Kubernetes集群中的节点资源
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : nodes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Server className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                暂无节点
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                没有找到任何节点信息
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {nodes.map((node) => (
              <Card key={`${node.cluster_id}-${node.name}`} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{node.name}</CardTitle>
                    <Badge variant={getStatusBadgeVariant(node.status)}>
                      {node.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {node.cluster_name} • {getRoleDisplay(node.roles)} • {node.age}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* IP 地址 */}
                    <div className="text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">内部IP:</span>
                        <span>{node.internal_ip || "N/A"}</span>
                      </div>
                      {node.external_ip && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">外部IP:</span>
                          <span>{node.external_ip}</span>
                        </div>
                      )}
                    </div>

                    {/* 资源容量和使用情况 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Cpu className="h-4 w-4 mr-1 text-blue-500" />
                          <span className="text-sm">CPU</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{node.cpu_capacity}</div>
                          {node.cpu_usage && (
                            <div className="text-xs text-gray-500">{node.cpu_usage} 已用</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <MemoryStick className="h-4 w-4 mr-1 text-green-500" />
                          <span className="text-sm">内存</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{node.memory_capacity}</div>
                          {node.memory_usage && (
                            <div className="text-xs text-gray-500">{node.memory_usage} 已用</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <HardDrive className="h-4 w-4 mr-1 text-purple-500" />
                          <span className="text-sm">Pods</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{node.pods_usage || '0'}/{node.pods_capacity}</div>
                          {node.pods_usage && (
                            <div className="text-xs text-gray-500">
                              {Math.round((parseInt(node.pods_usage) / parseInt(node.pods_capacity || '1')) * 100)}% 已用
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 版本信息 */}
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      K8s版本: {node.version}
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

export default function NodesPage() {
  return (
    <AuthGuard>
      <NodesPageContent />
    </AuthGuard>
  );
}
