"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, RefreshCw, Search, Trash2, Clock, Pause, Play, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCluster } from "@/lib/cluster-context";

interface CronJob {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  last_schedule_time: string | null;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function CronJobsContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [cronjobs, setCronJobs] = useState<CronJob[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedCluster, clusters } = useCluster();
  const clusterIdFromUrl = searchParams.get('cluster_id');
  const clusterId = clusterIdFromUrl || (selectedCluster ? String(selectedCluster) : null);

  // 获取集群信息
  const currentCluster = clusters.find(c => c.id === parseInt(clusterId || '0'));

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
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterId]);

  useEffect(() => {
    if (isAuthenticated && clusterId && selectedNamespace) {
      fetchCronJobs();
    }
  }, [isAuthenticated, clusterId, selectedNamespace]);

  const fetchNamespaces = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/namespaces?cluster_id=${clusterId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNamespaces(data);
        if (data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(data[0].name);
        }
      }
    } catch (error) {
      console.error('获取命名空间失败:', error);
      toast.error('获取命名空间失败');
    }
  };

  const fetchCronJobs = async () => {
    if (!selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/cronjobs/clusters/${clusterId}/namespaces/${selectedNamespace}/cronjobs`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCronJobs(data);
      } else {
        toast.error('获取CronJobs失败');
      }
    } catch (error) {
      console.error('获取CronJobs失败:', error);
      toast.error('获取CronJobs失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    setIsOperationLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/cronjobs/clusters/${clusterId}/namespaces/${selectedNamespace}/cronjobs/${name}`,
        {
          method: "DELETE",
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        toast.success('CronJob删除成功');
        fetchCronJobs();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredCronJobs = cronjobs.filter(cj =>
    cj.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAuthenticated) {
    return <div>验证中...</div>;
  }

  if (!clusterId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-600">
              <AlertCircle className="h-5 w-5 mr-2" />
              未选择集群
            </CardTitle>
            <CardDescription>
              请先从首页选择一个集群，或者确保 URL 中包含 cluster_id 参数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首页选择集群
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">CronJobs管理</h1>
            <p className="text-muted-foreground">
              管理定时任务工作负载
              {currentCluster && (
                <span className="ml-2">
                  • 集群: <span className="font-semibold text-foreground">{currentCluster.name}</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <Button onClick={fetchCronJobs} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CronJob列表</CardTitle>
          <CardDescription>选择命名空间查看其中的CronJobs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择命名空间" />
                  </SelectTrigger>
                  <SelectContent>
                    {namespaces.map((ns) => (
                      <SelectItem key={ns.name} value={ns.name}>
                        {ns.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="搜索CronJob名称..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">加载中...</span>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>调度时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>活跃任务</TableHead>
                      <TableHead>上次调度时间</TableHead>
                      <TableHead>年龄</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCronJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? '该命名空间中没有CronJobs' : '请选择命名空间'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCronJobs.map((cj) => (
                        <TableRow key={cj.name}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-2 text-blue-500" />
                              {cj.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {cj.schedule}
                            </code>
                          </TableCell>
                          <TableCell>
                            {cj.suspend ? (
                              <Badge variant="secondary">
                                <Pause className="h-3 w-3 mr-1" />
                                暂停
                              </Badge>
                            ) : (
                              <Badge variant="default">
                                <Play className="h-3 w-3 mr-1" />
                                运行中
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={cj.active > 0 ? "default" : "outline"}>
                              {cj.active}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {cj.last_schedule_time || '从未执行'}
                          </TableCell>
                          <TableCell>{cj.age}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDialog({
                                open: true,
                                title: "删除CronJob",
                                description: `确定要删除CronJob "${cj.name}" 吗？`,
                                onConfirm: () => handleDelete(cj.name),
                              })}
                              disabled={isOperationLoading}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}

export default function CronJobsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <CronJobsContent />
    </Suspense>
  );
}
