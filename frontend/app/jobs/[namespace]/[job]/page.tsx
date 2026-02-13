"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
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
import { ClusterContextRequired } from "@/components/ClusterContextRequired";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resolveClusterContext, withClusterId } from "@/lib/cluster-context-resolver";
import { jobApi, JobDetails, JobPod } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });

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
  const t = useTranslations("jobs");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const { runWithFeedback } = useAsyncActionFeedback();
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
      setJobDetails(null);
      setJobPods([]);
      setYamlContent("");
      return;
    }
    fetchJobData();
  }, [isAuthenticated, isClusterContextMissing, effectiveClusterId, resolvedParams.namespace, resolvedParams.job, activeTab]);

  const fetchJobData = async () => {
    if (!effectiveClusterId) return;

    setIsLoading(true);
    try {
      // 获取Job详情
      const jobResponse = await jobApi.getJob(effectiveClusterId, resolvedParams.namespace, resolvedParams.job);
      if (jobResponse.data) {
        setJobDetails(jobResponse.data);
      } else if (jobResponse.error) {
        toast.error(jobResponse.error);
        return;
      }

      // 获取关联的Pods
      if (activeTab === "pods") {
        const podsResponse = await jobApi.getJobPods(effectiveClusterId, resolvedParams.namespace, resolvedParams.job);
        if (podsResponse.data) {
          setJobPods(podsResponse.data);
        }
      }

      // 获取YAML配置
      if (activeTab === "yaml") {
        const yamlResponse = await jobApi.getJobYaml(effectiveClusterId, resolvedParams.namespace, resolvedParams.job);
        if (yamlResponse.data) {
          setYamlContent(yamlResponse.data.yaml_content);
        }
      }
    } catch (error) {
      console.error("load job data failed:", error);
      toast.error(t("detailsLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!effectiveClusterId) return;

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.deleteJob(effectiveClusterId, resolvedParams.namespace, resolvedParams.job);
          if (!response.data) {
            throw new Error(response.error || t("deleteErrorUnknown"));
          }

          router.push(withClusterId("/jobs", effectiveClusterId));
        },
        {
          loading: t("deleteLoading"),
          success: t("deleteSuccess"),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("delete job failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleRestartJob = async () => {
    if (!effectiveClusterId) return;

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.restartJob(effectiveClusterId, resolvedParams.namespace, resolvedParams.job);
          if (!response.data) {
            throw new Error(response.error || t("restartErrorUnknown"));
          }
          await fetchJobData();
        },
        {
          loading: t("restartLoading", { name: resolvedParams.job }),
          success: t("restartSuccess", { name: resolvedParams.job }),
          error: t("restartError"),
        }
      );
    } catch (error) {
      console.error("restart job failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleSaveYaml = async (content: string) => {
    if (!effectiveClusterId) return;

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.updateJobYaml(
            effectiveClusterId,
            resolvedParams.namespace,
            resolvedParams.job,
            content
          );
          if (!response.data) {
            throw new Error(response.error || t("yamlSaveErrorUnknown"));
          }
          setYamlContent(content);
        },
        {
          loading: t("yamlSaveLoading"),
          success: t("yamlSaveSuccess"),
          error: t("yamlSaveError"),
        }
      );
    } catch (error) {
      console.error("save job yaml failed:", error);
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

  if (isClusterContextMissing) {
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
                  {tAuth("logout")}
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ClusterContextRequired />
        </main>
      </div>
    );
  }

  if (!jobDetails) {
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
                  {tAuth("logout")}
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">{tCommon("loading")}</span>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t("detailsLoadError")}
              </CardContent>
            </Card>
          )}
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
                {tAuth("logout")}
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
              <Link href={withClusterId("/jobs", effectiveClusterId)}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("backToJobs")}
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">{jobDetails.name}</h1>
                <p className="text-muted-foreground">
                  {t("namespaceAndCluster", {
                    namespace: jobDetails.namespace,
                    cluster: jobDetails.cluster_name,
                  })}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={fetchJobData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {t("refresh")}
              </Button>
              <Button variant="outline" onClick={handleRestartJob} disabled={isOperationLoading}>
                <Play className="h-4 w-4 mr-2" />
                {t("restart")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDialog({
                  open: true,
                  title: t("deleteTitle"),
                  description: t("deleteDescription", { name: jobDetails.name }),
                  onConfirm: handleDeleteJob,
                })}
                disabled={isOperationLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {tCommon("delete")}
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
            <CardTitle className="text-sm font-medium">{t("status")}</CardTitle>
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
            <CardTitle className="text-sm font-medium">{t("completion")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobDetails.succeeded}/{jobDetails.completions}
            </div>
            {jobDetails.failed > 0 && (
              <p className="text-xs text-red-600">
                {t("failedCount", { count: jobDetails.failed })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("activePods")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobDetails.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("age")}</CardTitle>
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
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="pods">{t("podsTab")}</TabsTrigger>
          <TabsTrigger value="yaml">{t("yamlTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 基本信息 */}
            <Card>
              <CardHeader>
                <CardTitle>{t("basicInfo")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t("nameLabel")}</Label>
                    <p className="text-sm">{jobDetails.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t("namespaceLabel")}</Label>
                    <p className="text-sm">{jobDetails.namespace}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t("parallelismLabel")}</Label>
                    <p className="text-sm">{jobDetails.parallelism}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t("backoffLimitLabel")}</Label>
                    <p className="text-sm">{jobDetails.backoff_limit}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t("createdAtLabel")}</Label>
                    <p className="text-sm">{new Date(jobDetails.creation_timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t("ageLabel")}</Label>
                    <p className="text-sm">{jobDetails.age}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 状态条件 */}
            <Card>
              <CardHeader>
                <CardTitle>{t("conditionsTitle")}</CardTitle>
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
                          {t("lastUpdated", { time: new Date(condition.last_transition_time).toLocaleString() })}
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
                  <CardTitle>{t("labelsTitle")}</CardTitle>
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
                  <CardTitle>{t("annotationsTitle")}</CardTitle>
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
              <CardTitle>{t("relatedPodsTitle")}</CardTitle>
              <CardDescription>
                {t("relatedPodsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">{tCommon("loading")}</span>
                </div>
              ) : jobPods.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("noRelatedPods")}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("podNameLabel")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("nodeLabel")}</TableHead>
                      <TableHead>{t("restartCountLabel")}</TableHead>
                      <TableHead>{t("readyLabel")}</TableHead>
                      <TableHead>{t("age")}</TableHead>
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
              <CardTitle>{t("yamlConfig")}</CardTitle>
              <CardDescription>
                {t("yamlDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">{tCommon("loading")}</span>
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
