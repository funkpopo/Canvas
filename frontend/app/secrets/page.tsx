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
import { toast } from "sonner";

// ============ 类型定义 ============

interface Secret extends BaseResource {
  type: string;
  data_keys: string[];
  annotations: Record<string, string>;
}

// ============ 页面组件 ============

export default function SecretsPage() {
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
      const response = await secretApi.getSecretYaml(
        secret.cluster_id,
        secret.namespace,
        secret.name
      );
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setSelectedSecret(secret);
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
    if (!selectedClusterId || !yamlContent.trim()) return;

    try {
      const response = await secretApi.createSecretYaml(
        selectedClusterId,
        yamlContent
      );
      if (response.data) {
        toast.success("Secret创建成功");
        setIsCreateOpen(false);
        resetForm();
      } else {
        toast.error(`创建Secret失败: ${response.error}`);
      }
    } catch {
      toast.error("创建Secret失败");
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
      header: "类型",
      render: (item) => <Badge variant="outline">{item.type}</Badge>,
    },
    {
      key: "dataCount",
      header: "数据项数量",
      render: (item) => `${item.data_keys?.length || 0} 项`,
    },
    AgeColumn<Secret>(),
  ];

  // ============ 操作按钮定义 ============
  const actions: ActionDef<Secret>[] = [
    {
      key: "yaml",
      icon: Code,
      tooltip: "查看YAML",
      onClick: handleViewYaml,
    },
  ];

  // 创建按钮
  const createButton = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button onClick={resetForm}>
          <Plus className="w-4 h-4 mr-2" />
          创建Secret
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建Secret</DialogTitle>
          <DialogDescription>使用YAML格式创建新的机密数据</DialogDescription>
        </DialogHeader>
        <YamlEditor
          value={yamlContent}
          onChange={(value) => {
            setYamlContent(value);
            setYamlError("");
          }}
          error={yamlError}
          label="Secret YAML配置"
          template={yamlTemplate}
          onApplyTemplate={() => setYamlContent(yamlTemplate)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleCreateSecret}
            disabled={!yamlContent.trim() || !!yamlError}
          >
            创建Secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <ResourceList<Secret>
        resourceType="Secret"
        title="Secrets管理"
        description="管理Kubernetes集群中的机密数据（支持YAML格式编辑）"
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
        searchPlaceholder="搜索 Secret..."
        headerActions={createButton}
        deleteConfirm={{
          title: "删除 Secret",
          description: (item) =>
            `确定要删除 Secret "${item.namespace}/${item.name}" 吗？此操作不可撤销。`,
        }}
      />

      {/* YAML 预览对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedSecret
                ? `${selectedSecret.namespace}/${selectedSecret.name} - YAML配置`
                : "YAML配置"}
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
            <Button onClick={() => setIsYamlOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
