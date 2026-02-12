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
import { toast } from "sonner";

// ============ 类型定义 ============

type ConfigMap = ApiConfigMap;

// ============ 页面组件 ============

export default function ConfigMapsPage() {
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
      const response = await configmapApi.getConfigMap(
        cm.cluster_id,
        cm.namespace,
        cm.name
      );
      if (response.data) {
        setCmDetails(response.data);
        setSelectedCm(cm);
        setIsPreviewOpen(true);
      } else {
        toast.error(`获取ConfigMap详情失败: ${response.error}`);
      }
    } catch {
      toast.error("获取ConfigMap详情失败");
    }
  };

  // 查看 YAML
  const handleViewYaml = async (cm: ConfigMap) => {
    try {
      const response = await configmapApi.getConfigMapYaml(
        cm.cluster_id,
        cm.namespace,
        cm.name
      );
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setSelectedCm(cm);
        setIsYamlOpen(true);
      } else {
        toast.error(`获取YAML失败: ${response.error}`);
      }
    } catch {
      toast.error("获取YAML失败");
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
    if (!selectedClusterId || !yamlContent.trim()) return;

    try {
      const response = await configmapApi.createConfigMapYaml(
        selectedClusterId,
        yamlContent
      );
      if (response.data) {
        toast.success("ConfigMap创建成功");
        setIsCreateOpen(false);
        resetForm();
      } else {
        toast.error(`创建ConfigMap失败: ${response.error}`);
      }
    } catch {
      toast.error("创建ConfigMap失败");
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
      header: "数据项数量",
      render: (item) => (
        <Badge variant="outline">{Object.keys(item.data || {}).length} 项</Badge>
      ),
    },
    AgeColumn<ConfigMap>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<ConfigMap>[] = [
    {
      key: "view",
      icon: Eye,
      tooltip: "查看详情",
      onClick: handleViewConfigMap,
    },
    {
      key: "yaml",
      icon: Code,
      tooltip: "查看YAML",
      onClick: handleViewYaml,
    },
  ];

  // 创建按钮
  const createButton = canManageConfigMaps(user) ? (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={resetForm}>
          <Plus className="w-4 h-4 mr-2" />
          创建ConfigMap
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建ConfigMap</DialogTitle>
          <DialogDescription>使用YAML格式创建新的配置映射</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="yaml" className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="yaml">YAML配置</TabsTrigger>
          </TabsList>
          <TabsContent value="yaml" className="space-y-4">
            <YamlEditor
              value={yamlContent}
              onChange={(value) => {
                setYamlContent(value);
                setYamlError("");
              }}
              error={yamlError}
              label="ConfigMap YAML配置"
              template={yamlTemplate}
              onApplyTemplate={() => setYamlContent(yamlTemplate)}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleCreateConfigMap}
            disabled={!yamlContent.trim() || !!yamlError}
          >
            创建ConfigMap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <>
      <ResourceList<ConfigMap>
        resourceType="ConfigMap"
        title="ConfigMaps管理"
        description="管理Kubernetes集群中的配置映射（支持YAML格式编辑）"
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
        searchPlaceholder="搜索 ConfigMap..."
        headerActions={createButton}
        deleteConfirm={{
          title: "删除 ConfigMap",
          description: (item) =>
            `确定要删除 ConfigMap "${item.namespace}/${item.name}" 吗？此操作不可撤销。`,
        }}
      />

      {/* ConfigMap 详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCm
                ? `${selectedCm.namespace}/${selectedCm.name} - ConfigMap详情`
                : "ConfigMap详情"}
            </DialogTitle>
          </DialogHeader>
          {cmDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">名称</Label>
                  <p className="text-sm text-muted-foreground">{cmDetails.name}</p>
                </div>
                <div>
                  <Label className="font-medium">命名空间</Label>
                  <p className="text-sm text-muted-foreground">{cmDetails.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">年龄</Label>
                  <p className="text-sm text-muted-foreground">{cmDetails.age}</p>
                </div>
                <div>
                  <Label className="font-medium">数据项数量</Label>
                  <p className="text-sm text-muted-foreground">
                    {Object.keys(cmDetails.data || {}).length} 项
                  </p>
                </div>
              </div>

              <div>
                <Label className="font-medium">数据</Label>
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
                    <p className="text-sm text-muted-foreground">无数据</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">标签</Label>
                <div className="mt-1">
                  {cmDetails.labels && Object.keys(cmDetails.labels).length > 0 ? (
                    <div className="bg-black p-3 rounded text-xs font-mono text-gray-100">
                      {JSON.stringify(cmDetails.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无标签</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">注解</Label>
                <div className="mt-1">
                  {cmDetails.annotations &&
                  Object.keys(cmDetails.annotations).length > 0 ? (
                    <div className="bg-black p-3 rounded text-xs font-mono text-gray-100">
                      {JSON.stringify(cmDetails.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无注解</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ConfigMap YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedCm
                ? `${selectedCm.namespace}/${selectedCm.name} - YAML配置`
                : "YAML配置"}
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
            <Button onClick={() => setIsYamlOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
