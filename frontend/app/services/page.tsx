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
import { Settings, Plus, Eye, Code, Trash2 } from "lucide-react";

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
import { serviceApi, Service as ApiService } from "@/lib/api";
import { canManageResources } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useTranslations } from "@/hooks/use-translations";

// ============ 类型定义 ============

type Service = ApiService;

// ============ 页面组件 ============

export default function ServicesPage() {
  const t = useTranslations("services");
  const tCommon = useTranslations("common");
  const { user } = useAuth();

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState("default");

  // YAML 预览对话框状态
  const [isYamlOpen, setIsYamlOpen] = useState(false);
  const [yamlPreview, setYamlPreview] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // 刷新回调
  const [refreshKey, setRefreshKey] = useState(0);

  // 分页 fetch（用于 ResourceList 无限加载）
  const fetchServicesPage = async (
    clusterId: number,
    namespace: string | undefined,
    continueToken: string | null,
    limit: number
  ): Promise<ApiResponse<{ items: Service[]; continue_token: string | null }>> => {
    if (namespace) setSelectedNamespace(namespace);
    const result = await serviceApi.getServicesPage(clusterId, namespace, limit, continueToken);
    if (result.data) {
      return {
        data: {
          items: result.data.items as unknown as Service[],
          continue_token: result.data.continue_token ?? null,
        },
      };
    }
    return { error: result.error };
  };

  // 查看 YAML
  const handleViewYaml = async (service: Service) => {
    try {
      const response = await serviceApi.getServiceYaml(
        service.cluster_id,
        service.namespace,
        service.name
      );
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setSelectedService(service);
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
kind: Service
metadata:
  name: my-service
  namespace: ${selectedNamespace}
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
  selector:
    app: my-app
`);
    setYamlError("");
  };

  // 创建服务
  const handleCreateService = async () => {
    if (!yamlContent.trim()) return;

    try {
      // 简单解析 YAML 获取 name 和 namespace
      const lines = yamlContent.split("\n");
      let name = "";
      let namespace = selectedNamespace;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("name:")) {
          name = trimmed.split(":")[1].trim();
        } else if (trimmed.startsWith("namespace:")) {
          namespace = trimmed.split(":")[1].trim();
        }
      }

      // TODO: 需要集群 ID，这里暂时用创建 YAML 的方式
      toast.error("创建功能需要选择集群，请使用顶部的集群选择器");
    } catch {
      toast.error("创建服务失败");
    }
  };

  // YAML 模板
  const yamlTemplate = `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: ${selectedNamespace}
  labels:
    environment: production
    team: backend
    version: "1.2.3"
  annotations:
    description: "Web service for user authentication"
    created-by: "canvas"
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: 8080
    protocol: TCP
  - name: https
    port: 443
    targetPort: 8443
    protocol: TCP
  selector:
    app: my-app
    version: v1.0
`;

  // ============ 列定义 ============
  const columns: ColumnDef<Service>[] = [
    NameColumn<Service>(),
    {
      key: "type",
      header: t("type"),
      render: (item) => <Badge variant="outline">{item.type}</Badge>,
    },
    {
      key: "clusterIP",
      header: t("clusterIP"),
      render: (item) => item.cluster_ip || "-",
    },
    {
      key: "externalIP",
      header: t("externalIP"),
      render: (item) => item.external_ip || "-",
    },
    {
      key: "ports",
      header: t("ports"),
      render: (item) => (
        <div className="space-y-1">
          {item.ports.map((port, index) => (
            <div key={index} className="text-sm">
              {port.port}:{port.target_port}/{port.protocol}
            </div>
          ))}
        </div>
      ),
    },
    AgeColumn<Service>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<Service>[] = [
    {
      key: "yaml",
      icon: Code,
      tooltip: "查看YAML",
      onClick: handleViewYaml,
    },
    {
      key: "view",
      icon: Eye,
      tooltip: "查看详情",
      onClick: (item) => {
        // TODO: 跳转到详情页
      },
    },
    {
      key: "delete",
      icon: Trash2,
      tooltip: "删除",
      danger: true,
      visible: () => canManageResources(user),
      onClick: () => {},
    },
  ];

  // 创建按钮
  const createButton = canManageResources(user) ? (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={resetForm}>
          <Plus className="w-4 h-4 mr-2" />
          {t("createService")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createServiceTitle")}</DialogTitle>
          <DialogDescription>{t("createServiceDescription")}</DialogDescription>
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
              label={t("serviceYamlConfig")}
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
            onClick={handleCreateService}
            disabled={!yamlContent.trim() || !!yamlError}
          >
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <>
      <ResourceList<Service>
        key={refreshKey}
        resourceType="Service"
        title={t("title")}
        description={t("description")}
        icon={Settings}
        columns={columns}
        actions={actions.filter((a) => a.key !== "delete")}
        fetchPageFn={fetchServicesPage}
        deleteFn={async (clusterId, namespace, name) => {
          return await serviceApi.deleteService(clusterId, namespace, name);
        }}
        batchOperations={{
          delete: canManageResources(user),
          restart: false,
          label: false,
        }}
        searchFields={["name"]}
        requireNamespace={true}
        allowAllNamespaces={true}
        defaultNamespace=""
        searchPlaceholder={`搜索 Service...`}
        headerActions={createButton}
        deleteConfirm={{
          title: "删除 Service",
          description: (item) =>
            `确定要删除 Service "${item.namespace}/${item.name}" 吗？此操作不可撤销。`,
        }}
      />

      {/* YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedService
                ? `${selectedService.namespace}/${selectedService.name} - ${t("yamlConfig")}`
                : t("yamlConfig")}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={yamlPreview}
              readOnly
              className="font-mono text-sm min-h-[400px]"
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
