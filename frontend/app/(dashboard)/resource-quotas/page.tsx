"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Eye, Loader2 } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import ResourceQuotaForm from "@/components/ResourceQuotaForm";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resourceQuotaApi, namespaceApi } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "@/hooks/use-translations";

interface ResourceQuota {
  name: string;
  namespace: string;
  hard: Record<string, any>;
  used: Record<string, any>;
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function ResourceQuotasManagement() {
  const t = useTranslations("resourceQuotasPage");
  const tCommon = useTranslations("common");

  const [quotas, setQuotas] = useState<ResourceQuota[]>([]);
  const [isQuotasLoading, setIsQuotasLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  // 预览对话框状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedQuota, setSelectedQuota] = useState<any | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { user, isAuthenticated, isLoading } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  const fetchResourceQuotas = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsQuotasLoading(true);
    try {
      const response = await resourceQuotaApi.getResourceQuotas(selectedClusterId, selectedNamespace);
      if (response.data) {
        setQuotas(response.data);
      } else if (response.error) {
        toast.error(t("loadListErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("获取Resource Quota列表失败:", error);
      toast.error(t("loadListErrorWithMessage", { message: error instanceof Error ? error.message : t("networkError") }));
    } finally {
      setIsQuotasLoading(false);
    }
  };

  const fetchNamespaces = async () => {
    if (!selectedClusterId) return;
    try {
      const result = await namespaceApi.getNamespaces(selectedClusterId);

      if (result.data) {
        const namespaceNames = (result.data as any[]).map((ns: any) => ns.name);
        setNamespaces(namespaceNames);
      } else {
        console.error("获取命名空间列表失败");
        setNamespaces(["default"]);
      }
    } catch {
      console.error("获取命名空间列表出错");
      setNamespaces(["default"]);
    }
  };

  useEffect(() => {
    if (user && clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [user, clusters, selectedClusterId]);

  useEffect(() => {
    if (selectedClusterId) {
      fetchNamespaces();
    }
  }, [selectedClusterId]);

  useEffect(() => {
    if (selectedClusterId && selectedNamespace) {
      fetchResourceQuotas();
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteResourceQuota = async (quota: ResourceQuota) => {
    try {
      const response = await resourceQuotaApi.deleteResourceQuota(quota.cluster_id, quota.namespace, quota.name);
      if (!response.error) {
        toast.success(t("deleteSuccess"));
        fetchResourceQuotas();
      } else {
        toast.error(t("deleteErrorWithMessage", { message: response.error }));
      }
    } catch {
      toast.error(t("deleteError"));
    }
  };

  // 查看Resource Quota详情
  const handleViewResourceQuota = async (quota: ResourceQuota) => {
    try {
      setIsPreviewLoading(true);
      const response = await resourceQuotaApi.getResourceQuota(quota.cluster_id, quota.namespace, quota.name);
      if (response.data) {
        setSelectedQuota(response.data);
        setIsPreviewOpen(true);
      } else {
        toast.error(t("loadDetailsErrorWithMessage", { message: response.error }));
      }
    } catch {
      toast.error(t("loadDetailsError"));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // 创建Resource Quota
  const handleCreateResourceQuota = async (quotaData: any) => {
    if (!selectedClusterId) {
      toast.error(t("selectClusterFirst"));
      return;
    }

    try {
      const response = await resourceQuotaApi.createResourceQuota(selectedClusterId, quotaData);
      if (!response.error) {
        toast.success(t("createSuccess"));
        setIsCreateOpen(false);
        fetchResourceQuotas();
      } else {
        toast.error(t("createErrorWithMessage", { message: response.error }));
      }
    } catch {
      toast.error(t("createError"));
    }
  };

  // 检查认证状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">{t("pleaseLogin")}</h2>
          <Button onClick={() => router.push('/login')}>{t("goToLogin")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Toolbar: cluster/namespace selectors + create button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ClusterSelector
            value={selectedClusterId?.toString() || ""}
            onValueChange={(value) => setSelectedClusterId(value ? parseInt(value) : null)}
          />
          <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("selectNamespace")} />
            </SelectTrigger>
            <SelectContent>
              {namespaces.map(ns => (
                <SelectItem key={ns} value={ns}>{ns}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t("createQuota")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>
            {selectedNamespace ? t("namespaceValue", { namespace: selectedNamespace }) : t("selectNamespaceHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isQuotasLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">{tCommon("loading")}</span>
            </div>
          ) : quotas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? t("noQuotasInNamespace") : t("selectNamespaceToView")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("nameLabel")}</TableHead>
                  <TableHead>{t("hardLimitsLabel")}</TableHead>
                  <TableHead>{t("usedLabel")}</TableHead>
                  <TableHead>{t("ageLabel")}</TableHead>
                  <TableHead>{tCommon("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotas.map((quota) => (
                  <TableRow key={`${quota.cluster_id}-${quota.namespace}-${quota.name}`}>
                    <TableCell className="font-medium">{quota.name}</TableCell>
                    <TableCell>
                      <div className="text-sm max-w-xs">
                        {Object.entries(quota.hard).slice(0, 3).map(([key, value]) => (
                          <div key={key} className="truncate">{key}: {String(value)}</div>
                        ))}
                        {Object.keys(quota.hard).length > 3 && (
                          <div className="text-muted-foreground">{t("moreCount", { count: Object.keys(quota.hard).length - 3 })}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm max-w-xs">
                        {Object.entries(quota.used).slice(0, 3).map(([key, value]) => (
                          <div key={key} className="truncate">{key}: {String(value)}</div>
                        ))}
                        {Object.keys(quota.used).length > 3 && (
                          <div className="text-muted-foreground">{t("moreCount", { count: Object.keys(quota.used).length - 3 })}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{quota.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewResourceQuota(quota)}
                          disabled={isPreviewLoading}
                          aria-label={`${t("detailsTitle")}: ${quota.name}`}
                          title={`${t("detailsTitle")}: ${quota.name}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteResourceQuota(quota)}
                          className="text-red-600 hover:text-red-700"
                          aria-label={`${tCommon("delete")}: ${quota.name}`}
                          title={`${tCommon("delete")}: ${quota.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resource Quota详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedQuota ? t("detailsTitleWithName", { namespace: selectedQuota.namespace, name: selectedQuota.name }) : t("detailsTitle")}
            </DialogTitle>
          </DialogHeader>
          {selectedQuota && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">{t("nameLabel")}</Label>
                  <p className="text-sm text-muted-foreground">{selectedQuota.name}</p>
                </div>
                <div>
                  <Label className="font-medium">{t("namespaceLabel")}</Label>
                  <p className="text-sm text-muted-foreground">{selectedQuota.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">{t("ageLabel")}</Label>
                  <p className="text-sm text-muted-foreground">{selectedQuota.age}</p>
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("hardLimitsLabel")}</Label>
                <div className="mt-1">
                  {selectedQuota.hard && Object.keys(selectedQuota.hard).length > 0 ? (
                    <div className="bg-muted p-3 rounded">
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(selectedQuota.hard).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{key}:</span>
                            <span className="text-sm text-muted-foreground">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noHardLimits")}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("usedLabel")}</Label>
                <div className="mt-1">
                  {selectedQuota.used && Object.keys(selectedQuota.used).length > 0 ? (
                    <div className="bg-muted p-3 rounded">
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(selectedQuota.used).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{key}:</span>
                            <span className="text-sm text-muted-foreground">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noUsage")}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("labelsLabel")}</Label>
                <div className="mt-1">
                  {selectedQuota.labels && Object.keys(selectedQuota.labels).length > 0 ? (
                    <div className="bg-muted p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedQuota.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noLabels")}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("annotationsLabel")}</Label>
                <div className="mt-1">
                  {selectedQuota.annotations && Object.keys(selectedQuota.annotations).length > 0 ? (
                    <div className="bg-muted p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedQuota.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noAnnotations")}</p>
                  )}
                </div>
              </div>

              {selectedQuota.scopes && selectedQuota.scopes.length > 0 && (
                <div>
                  <Label className="font-medium">{t("scopesLabel")}</Label>
                  <div className="mt-1">
                    <div className="flex flex-wrap gap-2">
                      {selectedQuota.scopes.map((scope: string, index: number) => (
                        <Badge key={index} variant="outline">{scope}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedQuota.scope_selector && selectedQuota.scope_selector.length > 0 && (
                <div>
                  <Label className="font-medium">{t("scopeSelectorLabel")}</Label>
                  <div className="mt-1">
                    <div className="bg-muted p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedQuota.scope_selector, null, 2)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建Resource Quota对话框 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createQuota")}</DialogTitle>
          </DialogHeader>
          <ResourceQuotaForm
            onSubmit={handleCreateResourceQuota}
            onCancel={() => setIsCreateOpen(false)}
            namespaces={namespaces}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
