"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Activity, Search, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";

interface Deployment {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  updated_replicas: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  status: string;
  cluster_id: number;
  cluster_name: string;
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [filteredDeployments, setFilteredDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { selectedCluster } = useCluster();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (isAuthenticated) {
      fetchDeployments();
    }
  }, [isAuthenticated, authLoading, router, selectedCluster]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = deployments.filter(
        (deployment) =>
          deployment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          deployment.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
          deployment.cluster_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredDeployments(filtered);
    } else {
      setFilteredDeployments(deployments);
    }
  }, [searchTerm, deployments]);

  const fetchDeployments = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      const url = selectedCluster
        ? `http://localhost:8000/api/deployments?cluster_id=${selectedCluster}`
        : "http://localhost:8000/api/deployments";

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDeployments(data);
        setFilteredDeployments(data);
      } else {
        console.error("获取 Deployments 失败");
      }
    } catch (error) {
      console.error("获取 Deployments 出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (deployment: Deployment) => {
    const { replicas, ready_replicas, available_replicas } = deployment;

    if (ready_replicas === replicas && available_replicas === replicas) {
      return <Badge className="bg-green-500">Running</Badge>;
    } else if (ready_replicas === 0) {
      return <Badge variant="destructive">Failed</Badge>;
    } else {
      return <Badge className="bg-yellow-500">Updating</Badge>;
    }
  };

  if (authLoading || isLoading) {
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button variant="outline" onClick={() => router.push("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回首页
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <Activity className="h-6 w-6 mr-2" />
                    Deployments
                  </CardTitle>
                  <CardDescription>
                    管理和监控 Kubernetes Deployments
                  </CardDescription>
                </div>
                <Button onClick={fetchDeployments} variant="outline">
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索 Deployment..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {filteredDeployments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? "未找到匹配的 Deployment" : "暂无 Deployment"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>命名空间</TableHead>
                        <TableHead>集群</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>副本</TableHead>
                        <TableHead>镜像</TableHead>
                        <TableHead>年龄</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeployments.map((deployment) => (
                        <TableRow key={`${deployment.cluster_id}-${deployment.namespace}-${deployment.name}`}>
                          <TableCell className="font-medium">{deployment.name}</TableCell>
                          <TableCell>{deployment.namespace}</TableCell>
                          <TableCell>{deployment.cluster_name}</TableCell>
                          <TableCell>{getStatusBadge(deployment)}</TableCell>
                          <TableCell>
                            {deployment.ready_replicas}/{deployment.replicas}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={deployment.images.join(", ")}>
                              {deployment.images[0] || "N/A"}
                            </div>
                          </TableCell>
                          <TableCell>{deployment.age}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <Link
                                href={`/deployments/${deployment.namespace}/${deployment.name}?cluster_id=${deployment.cluster_id}`}
                              >
                                查看详情
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
