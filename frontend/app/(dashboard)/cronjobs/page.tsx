"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Search, Trash2, Clock, Pause, Play, AlertCircle, Plus } from "lucide-react";import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCluster } from "@/lib/cluster-context";
import { cronjobApi, namespaceApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

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
  const t = useTranslations("cronjobs");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
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

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createYamlContent, setCreateYamlContent] = useState("");
  const [createYamlError, setCreateYamlError] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedCluster } = useCluster();
  const clusterIdFromUrl = searchParams.get("cluster_id");
  const clusterId = clusterIdFromUrl || (selectedCluster ? String(selectedCluster) : null);
  const clusterIdNum = clusterId ? parseInt(clusterId, 10) : null;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    if (isAuthenticated && clusterIdNum) {
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterIdNum]);

  useEffect(() => {
    if (isAuthenticated && clusterIdNum && selectedNamespace) {
      fetchCronJobs();
    }
  }, [isAuthenticated, clusterIdNum, selectedNamespace]);

  const fetchNamespaces = async () => {
    if (!clusterIdNum) return;

    try {
      const response = await namespaceApi.getNamespaces(clusterIdNum);
      if (response.data) {
        setNamespaces(response.data);
        if (response.data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(response.data[0].name);
        }
      } else if (response.error) {
        toast.error(t("namespacesLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load namespaces failed:", error);
      toast.error(t("namespacesLoadError"));
    }
  };

  const fetchCronJobs = async () => {
    if (!selectedNamespace || !clusterIdNum) return;

    setIsLoading(true);
    try {
      const response = await cronjobApi.getCronJobs(clusterIdNum, selectedNamespace);
      if (response.data) {
        setCronJobs(response.data);
      } else if (response.error) {
        toast.error(t("listLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load cronjobs failed:", error);
      toast.error(t("listLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!clusterIdNum) return;

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await cronjobApi.deleteCronJob(clusterIdNum, selectedNamespace, name);
          if (response.error) {
            throw new Error(response.error || t("deleteErrorUnknown"));
          }
          await fetchCronJobs();
        },
        {
          loading: t("deleteLoading"),
          success: t("deleteSuccess"),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("delete cronjob failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredCronJobs = cronjobs.filter((cj) =>
    cj.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cronjobYamlTemplate = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-cronjob
  namespace: ${selectedNamespace || "default"}
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: my-job
            image: busybox:latest
            command: ["echo", "Hello from CronJob"]
          restartPolicy: OnFailure
`;

  const handleCreateCronJob = async () => {
    if (!clusterIdNum) {
      toast.error(t("selectClusterFirst"));
      return;
    }
    if (!createYamlContent.trim()) {
      toast.error(t("yamlRequired"));
      return;
    }
    try {
      await runWithFeedback(
        async () => {
          const response = await cronjobApi.createCronJob(
            clusterIdNum,
            selectedNamespace || "default",
            createYamlContent
          );
          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }
          setIsCreateOpen(false);
          setCreateYamlContent("");
          await fetchCronJobs();
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create cronjob failed:", error);
    }
  };

  if (!isAuthenticated) {
    return <div>{t("authVerifying")}</div>;
  }

  if (!clusterIdNum) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-8 w-8 text-yellow-600 mb-2" />
            <h3 className="text-lg font-medium mb-2">{t("clusterRequiredTitle")}</h3>
            <p className="text-muted-foreground mb-4">{t("clusterRequiredDescription")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setCreateYamlContent(cronjobYamlTemplate); setCreateYamlError(""); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t("createCronJob")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>{t("createDescription")}</DialogDescription>
            </DialogHeader>
            <YamlEditor
              value={createYamlContent}
              onChange={(value) => { setCreateYamlContent(value); setCreateYamlError(""); }}
              error={createYamlError}
              label={t("yamlEditorLabel")}
              template={cronjobYamlTemplate}
              onApplyTemplate={() => setCreateYamlContent(cronjobYamlTemplate)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleCreateCronJob} disabled={!createYamlContent.trim() || !!createYamlError}>
                {t("createCronJob")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button onClick={fetchCronJobs} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("namespacePlaceholder")} />
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
                    placeholder={t("searchPlaceholder")}
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
                <span className="ml-2">{tCommon("loading")}</span>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("nameLabel")}</TableHead>
                      <TableHead>{t("scheduleLabel")}</TableHead>
                      <TableHead>{t("statusLabel")}</TableHead>
                      <TableHead>{t("activeJobsLabel")}</TableHead>
                      <TableHead>{t("lastScheduleLabel")}</TableHead>
                      <TableHead>{t("ageLabel")}</TableHead>
                      <TableHead>{tCommon("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCronJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? t("noCronJobsInNamespace") : t("selectNamespaceFirst")}
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
                                {t("statusSuspended")}
                              </Badge>
                            ) : (
                              <Badge variant="default">
                                <Play className="h-3 w-3 mr-1" />
                                {t("statusRunning")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={cj.active > 0 ? "default" : "outline"}>{cj.active}</Badge>
                          </TableCell>
                          <TableCell>{cj.last_schedule_time || t("neverRun")}</TableCell>
                          <TableCell>{cj.age}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  title: t("deleteTitle"),
                                  description: t("deleteDescription", { name: cj.name }),
                                  onConfirm: () => handleDelete(cj.name),
                                })
                              }
                              disabled={isOperationLoading}
                              aria-label={`${tCommon("delete")}: ${cj.name}`}
                              title={`${tCommon("delete")}: ${cj.name}`}
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
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
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
