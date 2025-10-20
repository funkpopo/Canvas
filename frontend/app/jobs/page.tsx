"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Activity, Loader2, RefreshCw, AlertCircle, Play, Trash2, Plus, Search, Filter, History, Trash } from "lucide-react";
import { jobApi, Job } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Namespace {
  name: string;
  status: string;
}

export default function JobsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

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
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterId]);

  useEffect(() => {
    if (isAuthenticated && clusterId && selectedNamespace) {
      fetchJobs();
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

  const fetchJobs = async () => {
    if (!selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await jobApi.getJobs(parseInt(clusterId!), selectedNamespace);
      if (response.data) {
        setJobs(response.data);
        // 重置选择状态
        setSelectedJobs(new Set());
        setSelectAll(false);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('获取Jobs失败:', error);
      toast.error('获取Jobs失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateJob = async () => {
    if (!yamlContent.trim()) {
      toast.error('请输入YAML配置');
      return;
    }

    setIsOperationLoading(true);
    try {
      const response = await jobApi.createJob(parseInt(clusterId!), selectedNamespace, yamlContent);
      if (response.data) {
        toast.success('Job创建成功');
        setIsCreateDialogOpen(false);
        setYamlContent("");
        fetchJobs();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('创建Job失败:', error);
      toast.error('创建Job失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleDeleteJob = async (jobName: string) => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.deleteJob(parseInt(clusterId!), selectedNamespace, jobName);
      if (response.data) {
        toast.success('Job删除成功');
        fetchJobs();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('删除Job失败:', error);
      toast.error('删除Job失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleRestartJob = async (jobName: string) => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.restartJob(parseInt(clusterId!), selectedNamespace, jobName);
      if (response.data) {
        toast.success('Job重启成功');
        fetchJobs();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('重启Job失败:', error);
      toast.error('重启Job失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleSelectJob = (jobName: string, checked: boolean) => {
    const newSelected = new Set(selectedJobs);
    if (checked) {
      newSelected.add(jobName);
    } else {
      newSelected.delete(jobName);
    }
    setSelectedJobs(newSelected);
    setSelectAll(newSelected.size === filteredJobs.length);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedJobs(new Set(filteredJobs.map(job => job.name)));
    } else {
      setSelectedJobs(new Set());
    }
    setSelectAll(checked);
  };

  const handleBulkDelete = async () => {
    if (selectedJobs.size === 0) {
      toast.error('请先选择要删除的Jobs');
      return;
    }

    setIsOperationLoading(true);
    try {
      const response = await jobApi.bulkDeleteJobs(
        parseInt(clusterId!),
        selectedNamespace,
        Array.from(selectedJobs)
      );

      if (response.data) {
        toast.success(response.data.message);
        fetchJobs();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      toast.error('批量删除失败');
    } finally {
      setIsOperationLoading(false);
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

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || statusFilter === "all" || job.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (!isAuthenticated) {
    return <div>验证中...</div>;
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
            <h1 className="text-3xl font-bold">Jobs管理</h1>
            <p className="text-muted-foreground">管理工作负载中的一次性任务</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button onClick={fetchJobs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Link href="/jobs/history">
            <Button variant="outline">
              <History className="h-4 w-4 mr-2" />
              历史记录
            </Button>
          </Link>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                创建Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>创建Job</DialogTitle>
                <DialogDescription>
                  输入Job的YAML配置来创建新的Job
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="yaml">YAML配置</Label>
                  <Textarea
                    id="yaml"
                    placeholder="粘贴Job的YAML配置..."
                    value={yamlContent}
                    onChange={(e) => setYamlContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreateJob} disabled={isOperationLoading}>
                  {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job列表</CardTitle>
          <CardDescription>
            选择命名空间查看其中的Jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            {/* 筛选器 */}
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
                    placeholder="搜索Job名称..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="min-w-[150px]">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="状态筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="succeeded">成功</SelectItem>
                    <SelectItem value="failed">失败</SelectItem>
                    <SelectItem value="running">运行中</SelectItem>
                    <SelectItem value="pending">等待中</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 批量操作 */}
            {selectedJobs.size > 0 && (
              <div className="flex items-center space-x-2 p-4 bg-blue-50 border rounded-lg">
                <span className="text-sm text-blue-700">
                  已选择 {selectedJobs.size} 个Job
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "批量删除Job",
                    description: `确定要删除选中的 ${selectedJobs.size} 个Job吗？此操作不可撤销。`,
                    onConfirm: handleBulkDelete,
                  })}
                  disabled={isOperationLoading}
                >
                  <Trash className="h-3 w-3 mr-2" />
                  批量删除
                </Button>
              </div>
            )}

            {/* Job列表 */}
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>完成度</TableHead>
                      <TableHead>活跃Pods</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>年龄</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? '该命名空间中没有Jobs' : '请选择命名空间'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredJobs.map((job) => (
                        <TableRow key={job.name}>
                          <TableCell>
                            <Checkbox
                              checked={selectedJobs.has(job.name)}
                              onCheckedChange={(checked) => handleSelectJob(job.name, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/jobs/${selectedNamespace}/${job.name}?cluster_id=${clusterId}`}
                              className="font-medium text-blue-600 hover:text-blue-800"
                            >
                              {job.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm">
                                {job.succeeded}/{job.completions}
                              </span>
                              {job.failed > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {job.failed}失败
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{job.active}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(job.status)}>
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{job.age}</TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestartJob(job.name)}
                                disabled={isOperationLoading}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  title: "删除Job",
                                  description: `确定要删除Job "${job.name}" 吗？`,
                                  onConfirm: () => handleDeleteJob(job.name),
                                })}
                                disabled={isOperationLoading}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
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
