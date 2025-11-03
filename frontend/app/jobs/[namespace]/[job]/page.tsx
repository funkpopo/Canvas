"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Activity, Loader2, RefreshCw, AlertCircle, Play, Trash2, FileText, Code, Server, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { jobApi, JobDetails, JobPod } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import YamlEditor from "@/components/YamlEditor";

interface JobCondition {
  type: string;
  status: string;
  last_transition_time: string;
  reason: string;
  message: string;
}

export default function JobDetailsPage({ params }: { params: Promise<{ namespace: string; job: string }> }) {
  const resolvedParams = use(params);
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
  const [jobPods, setJobPods] = useState<JobPod[]>([]);
  const [yamlContent, setYamlContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isOperationLoading, setIsOperationLoading] = useState(false);
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
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && clusterId) {
      fetchJobData();
    }
  }, [isAuthenticated, clusterId, resolvedParams.namespace, resolvedParams.job, activeTab]);

  const fetchJobData = async () => {
    setIsLoading(true);
    try {
      // 获取Job详情
      const jobResponse = await jobApi.getJob(parseInt(clusterId!), resolvedParams.namespace, resolvedParams.job);
      if (jobResponse.data) {
        setJobDetails(jobResponse.data);
      } else if (jobResponse.error) {
        toast.error(jobResponse.error);
        return;
      }

      // 获取关联的Pods
      if (activeTab === "pods") {
        const podsResponse = await jobApi.getJobPods(parseInt(clusterId!), resolvedParams.namespace, resolvedParams.job);
        if (podsResponse.data) {
          setJobPods(podsResponse.data);
        }
      }

      // 获取YAML配置
      if (activeTab === "yaml") {
        const yamlResponse = await jobApi.getJobYaml(parseInt(clusterId!), resolvedParams.namespace, resolvedParams.job);
        if (yamlResponse.data) {
          setYamlContent(yamlResponse.data.yaml_content);
        }
      }
    } catch (error) {
      console.error('获取Job数据失败:', error);
      toast.error('获取Job数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteJob = async () => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.deleteJob(parseInt(clusterId!), resolvedParams.namespace, resolvedParams.job);
      if (response.data) {
        toast.success('Job删除成功');
        router.push(`/jobs?cluster_id=${clusterId}`);
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

  const handleRestartJob = async () => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.restartJob(parseInt(clusterId!), resolvedParams.namespace, resolvedParams.job);
      if (response.data) {
        toast.success('Job重启成功');
        fetchJobData();
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

  const handleSaveYaml = async (content: string) => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.updateJobYaml(parseInt(clusterId!), resolvedParams.namespace, resolvedParams.job, content);
      if (response.data) {
        toast.success('YAML更新成功');
        setYamlContent(content);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('更新YAML失败:', error);
      toast.error('更新YAML失败');
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

  const getConditionBadgeVariant = (type: string, status: string) => {
    if (status === 'True') {
      return type.toLowerCase().includes('failed') ? 'destructive' : 'default';
    }
    return 'secondary';
  };

  if (!isAuthenticated || !jobDetails) {
    return (
      <div className="min-h-screen bg-background">
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">加载中...</span>
          </div>
        </main>
      </div>
    );
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
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Link href={`/jobs?cluster_id=${clusterId}`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回列表
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">{jobDetails.name}</h1>
                <p className="text-muted-foreground">
                  命名空间: {jobDetails.namespace} | 集群: {jobDetails.cluster_name}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={fetchJobData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              <Button variant="outline" onClick={handleRestartJob} disabled={isOperationLoading}>
                <Play className="h-4 w-4 mr-2" />
                重启
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDialog({
                  open: true,
                  title: "删除Job",
                  description: `确定要删除Job "${jobDetails.name}" 吗？此操作不可撤销。`,
                  onConfirm: handleDeleteJob,
                })}
                disabled={isOperationLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* 状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">状态</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={getStatusBadgeVariant(jobDetails.status)} className="text-lg">
              {jobDetails.status}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">完成度</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobDetails.succeeded}/{jobDetails.completions}
            </div>
            {jobDetails.failed > 0 && (
              <p className="text-xs text-red-600">
                {jobDetails.failed} 个失败
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃Pods</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobDetails.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">年龄</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobDetails.age}</div>
          </CardContent>
        </Card>
      </div>

      {/* 详细内容选项卡 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="pods">Pods</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 基本信息 */}
            <Card>
              <CardHeader>
                <CardTitle>基本信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">名称</Label>
                    <p className="text-sm">{jobDetails.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">命名空间</Label>
                    <p className="text-sm">{jobDetails.namespace}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">并行度</Label>
                    <p className="text-sm">{jobDetails.parallelism}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">重试限制</Label>
                    <p className="text-sm">{jobDetails.backoff_limit}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">创建时间</Label>
                    <p className="text-sm">{new Date(jobDetails.creation_timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">年龄</Label>
                    <p className="text-sm">{jobDetails.age}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 状态条件 */}
            <Card>
              <CardHeader>
                <CardTitle>状态条件</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {jobDetails.conditions.map((condition: JobCondition, index: number) => (
                    <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge variant={getConditionBadgeVariant(condition.type, condition.status)}>
                            {condition.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {condition.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {condition.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          最后更新: {new Date(condition.last_transition_time).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 标签和注解 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.keys(jobDetails.labels).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>标签</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(jobDetails.labels).map(([key, value]) => (
                      <Badge key={key} variant="outline">
                        {key}={value}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {Object.keys(jobDetails.annotations).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>注解</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(jobDetails.annotations).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pods" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>关联的Pods</CardTitle>
              <CardDescription>
                Job创建的Pod实例列表
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">加载中...</span>
                </div>
              ) : jobPods.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  没有找到关联的Pods
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pod名称</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>节点</TableHead>
                      <TableHead>重启次数</TableHead>
                      <TableHead>准备就绪</TableHead>
                      <TableHead>年龄</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobPods.map((pod) => (
                      <TableRow key={pod.name}>
                        <TableCell className="font-medium">{pod.name}</TableCell>
                        <TableCell>
                          <Badge variant={pod.status === 'Running' ? 'default' : 'secondary'}>
                            {pod.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{pod.node_name || '-'}</TableCell>
                        <TableCell>{pod.restarts}</TableCell>
                        <TableCell>{pod.ready_containers}</TableCell>
                        <TableCell>{pod.age}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>YAML配置</CardTitle>
              <CardDescription>
                Job的完整YAML配置，可以直接编辑
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">加载中...</span>
                </div>
              ) : (
                <YamlEditor
                  value={yamlContent}
                  onChange={setYamlContent}
                  onSave={() => handleSaveYaml(yamlContent)}
                  readOnly={false}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
      </main>
    </div>
  );
}