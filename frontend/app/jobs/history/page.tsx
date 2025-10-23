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
import { ArrowLeft, Loader2, RefreshCw, Search, Filter, Calendar } from "lucide-react";
import { jobApi, JobHistory } from "@/lib/api";
import { toast } from "sonner";

interface Cluster {
  id: number;
  name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function JobHistoryContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [clusterFilter, setClusterFilter] = useState<string>("all");
  const [namespaceFilter, setNamespaceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchClusters();
      fetchHistory();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && clusterFilter && clusterFilter !== "all") {
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterFilter]);

  const fetchClusters = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/clusters', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClusters(data);
      }
    } catch (error) {
      console.error('获取集群失败:', error);
      toast.error('获取集群失败');
    }
  };

  const fetchNamespaces = async () => {
    if (!clusterFilter || clusterFilter === "all") return;

    try {
      const response = await fetch(`http://localhost:8000/api/namespaces?cluster_id=${clusterFilter}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNamespaces(data);
      }
    } catch (error) {
      console.error('获取命名空间失败:', error);
      toast.error('获取命名空间失败');
    }
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await jobApi.getJobHistory(
        clusterFilter && clusterFilter !== "all" ? parseInt(clusterFilter) : undefined,
        namespaceFilter && namespaceFilter !== "all" ? namespaceFilter : undefined,
        statusFilter && statusFilter !== "all" ? statusFilter : undefined,
        startDate || undefined,
        endDate || undefined,
        limit
      );

      if (response.data) {
        setHistory(response.data);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
      toast.error('获取历史记录失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonitorStatus = async (historyId: number) => {
    try {
      const response = await jobApi.monitorJobStatus(historyId);
      if (response.data) {
        toast.success('状态监控完成');
        fetchHistory(); // 刷新列表
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('监控状态失败:', error);
      toast.error('监控状态失败');
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'succeeded':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'running':
      case 'active':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const filteredHistory = history.filter(record => {
    const matchesSearch = record.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (record.error_message && record.error_message.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  if (!isAuthenticated) {
    return <div>验证中...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/jobs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回Jobs
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Job历史记录</h1>
            <p className="text-muted-foreground">查看和管理Job的执行历史</p>
          </div>
        </div>
        <Button onClick={fetchHistory} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>历史记录筛选</CardTitle>
          <CardDescription>
            使用筛选条件查找特定的Job历史记录
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* 搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="搜索Job名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 集群筛选 */}
            <Select value={clusterFilter} onValueChange={setClusterFilter}>
              <SelectTrigger>
                <SelectValue placeholder="选择集群" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有集群</SelectItem>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id.toString()}>
                    {cluster.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 命名空间筛选 */}
            <Select value={namespaceFilter} onValueChange={setNamespaceFilter} disabled={clusterFilter === "all"}>
              <SelectTrigger>
                <SelectValue placeholder="选择命名空间" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有命名空间</SelectItem>
                {namespaces.map((ns) => (
                  <SelectItem key={ns.name} value={ns.name}>
                    {ns.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 状态筛选 */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有状态</SelectItem>
                <SelectItem value="Pending">等待中</SelectItem>
                <SelectItem value="Running">运行中</SelectItem>
                <SelectItem value="Succeeded">成功</SelectItem>
                <SelectItem value="Failed">失败</SelectItem>
              </SelectContent>
            </Select>

            {/* 开始日期 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 结束日期 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={fetchHistory} disabled={isLoading}>
              <Filter className="h-4 w-4 mr-2" />
              应用筛选
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job历史记录列表</CardTitle>
          <CardDescription>
            显示 {filteredHistory.length} 条记录
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              没有找到匹配的历史记录
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job名称</TableHead>
                    <TableHead>命名空间</TableHead>
                    <TableHead>集群</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>开始时间</TableHead>
                    <TableHead>结束时间</TableHead>
                    <TableHead>持续时间</TableHead>
                    <TableHead>Pods统计</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.job_name}</TableCell>
                      <TableCell>{record.namespace}</TableCell>
                      <TableCell>{record.cluster_id}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(record.status)}>
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.start_time ? new Date(record.start_time).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell>
                        {record.end_time ? new Date(record.end_time).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell>{formatDuration(record.duration || undefined)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>成功: {record.succeeded_pods}</div>
                          <div>失败: {record.failed_pods}</div>
                          <div>总数: {record.total_pods}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMonitorStatus(record.id)}
                        >
                          监控状态
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
  );
}

export default function JobHistoryPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <JobHistoryContent />
    </Suspense>
  );
}
