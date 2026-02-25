"use client";

import { useEffect, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Search, Trash2, TrendingUp, Plus } from "lucide-react";
import { useCluster } from "@/lib/cluster-context";
import { toast } from "sonner";
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
import { hpaApi, namespaceApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { PageHeader } from "@/components/PageHeader";

interface HPA {
  name: string;
  namespace: string;
  target_ref: string;
  min_replicas: number;
  max_replicas: number;
  current_replicas: number;
  desired_replicas: number;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function HPAsContent() {
  const t = useTranslations("hpas");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const { activeCluster } = useCluster();
  const [hpas, setHPAs] = useState<HPA[]>([]);
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

  const clusterId = activeCluster?.id.toString();
  const clusterIdNum = clusterId ? parseInt(clusterId, 10) : null;

  useEffect(() => {
    if (clusterIdNum) {
      fetchNamespaces();
    }
  }, [clusterIdNum]);

  useEffect(() => {
    if (clusterIdNum && selectedNamespace) {
      fetchHPAs();
    }
  }, [clusterIdNum, selectedNamespace]);

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

  const fetchHPAs = async () => {
    if (!selectedNamespace || !clusterIdNum) return;

    setIsLoading(true);
    try {
      const response = await hpaApi.getHPAs(clusterIdNum, selectedNamespace);
      if (response.data) {
        setHPAs(response.data);
      } else if (response.error) {
        toast.error(t("listLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load hpas failed:", error);
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
          const response = await hpaApi.deleteHPA(clusterIdNum, selectedNamespace, name);
          if (response.error) {
            throw new Error(response.error || t("deleteErrorUnknown"));
          }
          await fetchHPAs();
        },
        {
          loading: t("deleteLoading"),
          success: t("deleteSuccess"),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("delete hpa failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredHPAs = hpas.filter((hpa) =>
    hpa.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const hpaYamlTemplate = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-hpa
  namespace: ${selectedNamespace || "default"}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-deployment
  minReplicas: 1
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
`;

  const handleCreateHPA = async () => {
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
          const response = await hpaApi.createHPA(
            clusterIdNum,
            selectedNamespace || "default",
            createYamlContent
          );
          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }
          setIsCreateOpen(false);
          setCreateYamlContent("");
          await fetchHPAs();
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create hpa failed:", error);
    }
  };

  if (!clusterIdNum) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium mb-2">{t("clusterRequiredTitle")}</h3>
            <p className="text-muted-foreground mb-4">{t("clusterRequiredDescription")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setCreateYamlContent(hpaYamlTemplate);
                    setCreateYamlError("");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("createHPA")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("createTitle")}</DialogTitle>
                  <DialogDescription>{t("createDescription")}</DialogDescription>
                </DialogHeader>
                <YamlEditor
                  value={createYamlContent}
                  onChange={(value) => {
                    setCreateYamlContent(value);
                    setCreateYamlError("");
                  }}
                  error={createYamlError}
                  label={t("yamlEditorLabel")}
                  template={hpaYamlTemplate}
                  onApplyTemplate={() => setCreateYamlContent(hpaYamlTemplate)}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    onClick={handleCreateHPA}
                    disabled={!createYamlContent.trim() || !!createYamlError}
                  >
                    {t("createHPA")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button onClick={fetchHPAs} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </>
        }
      />

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
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("nameLabel")}</TableHead>
                      <TableHead>{t("targetLabel")}</TableHead>
                      <TableHead>{t("replicasRangeLabel")}</TableHead>
                      <TableHead>{t("currentDesiredLabel")}</TableHead>
                      <TableHead>{t("ageLabel")}</TableHead>
                      <TableHead>{tCommon("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHPAs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? t("noHpasInNamespace") : t("selectNamespaceFirst")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHPAs.map((hpa) => (
                        <TableRow key={hpa.name}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <TrendingUp className="h-4 w-4 mr-2 text-blue-500" />
                              {hpa.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{hpa.target_ref}</Badge>
                          </TableCell>
                          <TableCell>
                            {hpa.min_replicas} - {hpa.max_replicas}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                hpa.current_replicas === hpa.desired_replicas
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {hpa.current_replicas} / {hpa.desired_replicas}
                            </Badge>
                          </TableCell>
                          <TableCell>{hpa.age}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  title: t("deleteTitle"),
                                  description: t("deleteDescription", { name: hpa.name }),
                                  onConfirm: () => handleDelete(hpa.name),
                                })
                              }
                              disabled={isOperationLoading}
                              aria-label={`${tCommon("delete")}: ${hpa.name}`}
                              title={`${tCommon("delete")}: ${hpa.name}`}
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

export default function HPAsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <HPAsContent />
    </Suspense>
  );
}
