"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Eye, Code, Trash2 } from "lucide-react";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });
import {
  ResourceList,
  ColumnDef,
  ActionDef,
  BaseResource,
  NameColumn,
  AgeColumn,
  ApiResponse,
} from "@/components/ResourceList";
import { configmapApi, ConfigMap as ApiConfigMap } from "@/lib/api";
import { canManageConfigMaps } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { useTranslations } from "@/hooks/use-translations";
import { toast } from "sonner";

// ============ 类型定义 ============

type ConfigMap = ApiConfigMap;

// ============ 页面组件 ============

export default function ConfigMapsPage() {
  const t = useTranslations("configmaps");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const { user } = useAuth();

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);

  // 预览对话框状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedCm, setSelectedCm] = useState<ConfigMap | null>(null);
  const [cmDetails, setCmDetails] = useState<any>(null);

  // YAML 预览对话框状态
  const [isYamlOpen, setIsYamlOpen] = useState(false);
  const [yamlPreview, setYamlPreview] = useState("");

  // 分页 fetch（用于 ResourceList 无限加载）
  const fetchConfigMapsPage = async (
    clusterId: number,
    namespace: string | undefined,
    continueToken: string | null,
    limit: number
  ): Promise<ApiResponse<{ items: ConfigMap[]; continue_token: string | null }>> => {
    if (namespace) setSelectedNamespace(namespace);
    setSelectedClusterId(clusterId);
    const result = await configmapApi.getConfigMapsPage(clusterId, namespace, limit, continueToken);
    if (result.data) {
      return {
        data: {
          items: result.data.items as unknown as ConfigMap[],
          continue_token: result.data.continue_token ?? null,
        },
      };
    }
    return { error: result.error };
  };

  // 查看 ConfigMap 详情
  const handleViewConfigMap = async (cm: ConfigMap) => {
    try {
      await runWithFeedback(
        async () => {
          const response = await configmapApi.getConfigMap(
            cm.cluster_id,
            cm.namespace,
            cm.name
          );
          if (!response.data) {
            throw new Error(response.error || t("detailsLoadErrorUnknown"));
          }

          setCmDetails(response.data);
          setSelectedCm(cm);
          setIsPreviewOpen(true);
        },
        {
          loading: t("detailsLoadLoading"),
          success: t("detailsLoadSuccess"),
          error: t("detailsLoadError"),
        }
      );
    } catch (error) {
      console.error("load configmap details failed:", error);
    }
  };

  // 查看 YAML
  const handleViewYaml = async (cm: ConfigMap) => {
    try {
      await runWithFeedback(
        async () => {
          const response = await configmapApi.getConfigMapYaml(
            cm.cluster_id,
            cm.namespace,
            cm.name
          );
          if (!response.data) {
            throw new Error(response.error || t("yamlLoadErrorUnknown"));
          }

          setYamlPreview(response.data.yaml);
          setSelectedCm(cm);
          setIsYamlOpen(true);
        },
        {
          loading: t("yamlLoadLoading"),
          success: t("yamlLoadSuccess"),
          error: t("yamlLoadError"),
        }
      );
    } catch (error) {
      console.error("load configmap yaml failed:", error);
    }
  };

  // 重置表单
  const resetForm = () => {
    setYamlContent(`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: ${selectedNamespace}
data: {}
`);
    setYamlError("");
  };

  // 创建 ConfigMap
  const handleCreateConfigMap = async () => {
    if (!selectedClusterId) {
      toast.error(t("selectClusterFirst"));
      return;
    }

    if (!yamlContent.trim()) {
      toast.error(t("yamlRequired"));
      return;
    }

    try {
      await runWithFeedback(
        async () => {
          const response = await configmapApi.createConfigMapYaml(
            selectedClusterId,
            yamlContent
          );
          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }

          setIsCreateOpen(false);
          resetForm();
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create configmap failed:", error);
    }
  };

  // YAML 模板
  const yamlTemplate = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: ${selectedNamespace}
  labels:
    environment: production
    config-type: application
    managed-by: canvas
data:
  config.yaml: |
    apiVersion: v1
    kind: ConfigMap
    data:
      key: value
  app.properties: |
    database.url=jdbc:mysql://localhost:3306/mydb
    database.username=user
    database.password=password
  nginx.conf: |
    server {
      listen 80;
      server_name example.com;
      location / {
        proxy_pass http://localhost:8080;
      }
    }
`;

  // ============ 列定义 ============
  const columns: ColumnDef<ConfigMap>[] = [
    NameColumn<ConfigMap>(),
    {
      key: "dataCount",
      header: t("dataItems"),
      render: (item) => (
        <Badge variant="outline">{t("itemsCount", { count: Object.keys(item.data || {}).length })}</Badge>
      ),
    },
    AgeColumn<ConfigMap>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<ConfigMap>[] = [
    {
      key: "view",
      icon: Eye,
      tooltip: t("viewDetails"),
      onClick: handleViewConfigMap,
    },
    {
      key: "yaml",
      icon: Code,
      tooltip: t("viewYaml"),
      onClick: handleViewYaml,
    },
  ];

  // 创建按钮
  const createButton = canManageConfigMaps(user) ? (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={resetForm}>
          <Plus className="w-4 h-4 mr-2" />
          {t("createConfigMap")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="yaml" className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="yaml">{t("yamlConfig")}</TabsTrigger>
          </TabsList>
          <TabsContent value="yaml" className="space-y-4">
            <YamlEditor
              value={yamlContent}
              onChange={(value) => {
                setYamlContent(value);
                setYamlError("");
              }}
              error={yamlError}
              label={t("yamlEditorLabel")}
              template={yamlTemplate}
              onApplyTemplate={() => setYamlContent(yamlTemplate)}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleCreateConfigMap}
            disabled={!yamlContent.trim() || !!yamlError}
          >
            {t("createConfigMap")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <>
      <ResourceList<ConfigMap>
        resourceType="ConfigMap"
        title={t("title")}
        description={t("description")}
        icon={FileText}
        columns={columns}
        actions={actions}
        fetchPageFn={fetchConfigMapsPage}
        deleteFn={async (clusterId, namespace, name) => {
          return await configmapApi.deleteConfigMap(clusterId, namespace, name);
        }}
        batchOperations={{
          delete: canManageConfigMaps(user),
          restart: false,
          label: false,
        }}
        searchFields={["name"]}
        requireNamespace={true}
        allowAllNamespaces={true}
        defaultNamespace=""
        searchPlaceholder={t("searchPlaceholder")}
        headerActions={createButton}
        deleteConfirm={{
          title: t("deleteTitle"),
          description: (item) =>
            t("deleteDescription", { namespace: item.namespace, name: item.name }),
        }}
      />

      {/* ConfigMap 详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCm
                ? t("detailsDialogTitle", { namespace: selectedCm.namespace, name: selectedCm.name })
                : t("detailsDialogFallbackTitle")}
            </DialogTitle>
          </DialogHeader>
          {cmDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">{t("name")}</Label>
                  <p className="text-sm text-muted-foreground">{cmDetails.name}</p>
                </div>
                <div>
                  <Label className="font-medium">{t("namespace")}</Label>
                  <p className="text-sm text-muted-foreground">{cmDetails.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">{t("age")}</Label>
                  <p className="text-sm text-muted-foreground">{cmDetails.age}</p>
                </div>
                <div>
                  <Label className="font-medium">{t("dataItems")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("itemsCount", { count: Object.keys(cmDetails.data || {}).length })}
                  </p>
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("data")}</Label>
                <div className="mt-1">
                  {cmDetails.data && Object.keys(cmDetails.data).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(cmDetails.data).map(([key, value]) => (
                        <div key={key} className="bg-muted p-3 rounded">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">{key}</span>
                          </div>
                          <div className="bg-black p-3 rounded text-xs font-mono whitespace-pre-wrap text-gray-100">
                            {String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noData")}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("labels")}</Label>
                <div className="mt-1">
                  {cmDetails.labels && Object.keys(cmDetails.labels).length > 0 ? (
                    <div className="bg-black p-3 rounded text-xs font-mono text-gray-100">
                      {JSON.stringify(cmDetails.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noLabels")}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">{t("annotations")}</Label>
                <div className="mt-1">
                  {cmDetails.annotations &&
                  Object.keys(cmDetails.annotations).length > 0 ? (
                    <div className="bg-black p-3 rounded text-xs font-mono text-gray-100">
                      {JSON.stringify(cmDetails.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noAnnotations")}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ConfigMap YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedCm
                ? t("yamlDialogTitle", { namespace: selectedCm.namespace, name: selectedCm.name })
                : t("yamlDialogFallbackTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={yamlPreview}
              readOnly
              className="font-mono text-xs min-h-[400px] bg-black text-gray-100"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setIsYamlOpen(false)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
