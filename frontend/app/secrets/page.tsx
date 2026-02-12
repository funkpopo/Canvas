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
import { Textarea } from "@/components/ui/textarea";
import { Lock, Plus, Code, Trash2 } from "lucide-react";

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
import { secretApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { useTranslations } from "@/hooks/use-translations";
import { toast } from "sonner";

// ============ 类型定义 ============

interface Secret extends BaseResource {
  type: string;
  data_keys: string[];
  annotations: Record<string, string>;
}

// ============ 页面组件 ============

export default function SecretsPage() {
  const t = useTranslations("secrets");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const { user } = useAuth();

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);

  // YAML 预览对话框状态
  const [isYamlOpen, setIsYamlOpen] = useState(false);
  const [yamlPreview, setYamlPreview] = useState("");
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);

  // 分页 fetch（用于 ResourceList 无限加载）
  const fetchSecretsPage = async (
    clusterId: number,
    namespace: string | undefined,
    continueToken: string | null,
    limit: number
  ): Promise<ApiResponse<{ items: Secret[]; continue_token: string | null }>> => {
    if (namespace) setSelectedNamespace(namespace);
    setSelectedClusterId(clusterId);
    const result = await secretApi.getSecretsPage(clusterId, namespace, limit, continueToken);
    if (result.data) {
      return {
        data: {
          items: result.data.items as unknown as Secret[],
          continue_token: result.data.continue_token ?? null,
        },
      };
    }
    return { error: result.error };
  };

  // 查看 YAML
  const handleViewYaml = async (secret: Secret) => {
    try {
      await runWithFeedback(
        async () => {
          const response = await secretApi.getSecretYaml(
            secret.cluster_id,
            secret.namespace,
            secret.name
          );
          if (!response.data) {
            throw new Error(response.error || t("yamlLoadErrorUnknown"));
          }

          setYamlPreview(response.data.yaml);
          setSelectedSecret(secret);
          setIsYamlOpen(true);
        },
        {
          loading: t("yamlLoadLoading"),
          success: t("yamlLoadSuccess"),
          error: t("yamlLoadError"),
        }
      );
    } catch (error) {
      console.error("load secret yaml failed:", error);
    }
  };

  // 重置表单
  const resetForm = () => {
    setYamlContent(`apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: ${selectedNamespace}
type: Opaque
data: {}
`);
    setYamlError("");
  };

  // 创建 Secret
  const handleCreateSecret = async () => {
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
          const response = await secretApi.createSecretYaml(
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
      console.error("create secret failed:", error);
    }
  };

  // YAML 模板
  const yamlTemplate = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: ${selectedNamespace}
  labels:
    environment: production
    managed-by: canvas
type: Opaque
data:
  username: YWRtaW4=  # base64 encoded "admin"
  password: c2VjcmV0  # base64 encoded "secret"
stringData:
  config.json: |
    {
      "database": {
        "host": "localhost",
        "port": 5432,
        "name": "mydb"
      },
      "features": {
        "debug": true,
        "cache": false
      }
    }`;

  // ============ 列定义 ============
  const columns: ColumnDef<Secret>[] = [
    NameColumn<Secret>(),
    {
      key: "type",
      header: t("type"),
      render: (item) => <Badge variant="outline">{item.type}</Badge>,
    },
    {
      key: "dataCount",
      header: t("dataItems"),
      render: (item) => t("itemsCount", { count: item.data_keys?.length || 0 }),
    },
    AgeColumn<Secret>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<Secret>[] = [
    {
      key: "yaml",
      icon: Code,
      tooltip: t("viewYaml"),
      onClick: handleViewYaml,
    },
  ];

  // 创建按钮
  const createButton = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={resetForm}>
          <Plus className="w-4 h-4 mr-2" />
          {t("createSecret")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleCreateSecret}
            disabled={!yamlContent.trim() || !!yamlError}
          >
            {t("createSecret")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <ResourceList<Secret>
        resourceType="Secret"
        title={t("title")}
        description={t("description")}
        icon={Lock}
        columns={columns}
        actions={actions}
        fetchPageFn={fetchSecretsPage}
        deleteFn={async (clusterId, namespace, name) => {
          return await secretApi.deleteSecret(clusterId, namespace, name);
        }}
        batchOperations={{
          delete: true,
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

      {/* YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedSecret
                ? t("yamlDialogTitle", { namespace: selectedSecret.namespace, name: selectedSecret.name })
                : t("yamlDialogFallbackTitle")}
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
