"use client";

import { Badge } from "@/components/ui/badge";
import { Server, Cpu, MemoryStick, HardDrive } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { nodeApi, Node } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import {
  ResourceList,
  BaseResource,
  ColumnDef,
  CardRenderConfig,
  ApiResponse,
  getStatusBadgeVariant,
} from "@/components/ResourceList";

// Node 资源接口 - 扩展 BaseResource
interface NodeInfo extends BaseResource {
  status: string;
  roles: string[];
  version: string;
  internal_ip: string | null;
  external_ip: string | null;
  cpu_capacity: string;
  memory_capacity: string;
  pods_capacity: string;
  cpu_usage?: string;
  memory_usage?: string;
  pods_usage?: string;
}

// 转换 Node 到 NodeInfo (添加 BaseResource 必需字段)
function transformNode(node: Node): NodeInfo {
  return {
    ...node,
    id: `${node.cluster_id}-${node.name}`,
    namespace: "", // 节点不属于任何命名空间
    pods_capacity: node.pod_capacity,
    internal_ip: node.internal_ip || null,
    external_ip: node.external_ip || null,
  };
}

// 自定义 fetch 函数 - 转换 API 响应
async function fetchNodesApi(): Promise<ApiResponse<NodeInfo[]>> {
  const result = await nodeApi.getNodes();
  if (result.data) {
    return {
      data: result.data.map(transformNode),
    };
  }
  return { error: result.error };
}

// 获取角色显示
function getRoleDisplay(roles: string[], t: (key: string) => string) {
  if (roles.includes("master")) return t("master");
  if (roles.includes("worker")) return t("worker");
  return t("node");
}

function NodesPageContent() {
  const t = useTranslations("nodes");

  // 列定义
  const columns: ColumnDef<NodeInfo>[] = [
    {
      key: "name",
      header: t("nodeName"),
      render: (item) => <span className="font-medium">{item.name}</span>,
    },
    {
      key: "status",
      header: t("status"),
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: "role",
      header: t("roles"),
      render: (item) => getRoleDisplay(item.roles, t),
    },
    {
      key: "cluster",
      header: t("cluster"),
      render: (item) => item.cluster_name,
    },
    {
      key: "internal_ip",
      header: t("internalIp"),
      render: (item) => item.internal_ip || t("notAvailable"),
    },
    {
      key: "cpu",
      header: t("cpu"),
      render: (item) => (
        <div>
          <span>{item.cpu_capacity}</span>
          {item.cpu_usage && (
            <span className="text-xs text-gray-500 ml-1">({item.cpu_usage})</span>
          )}
        </div>
      ),
    },
    {
      key: "memory",
      header: t("memory"),
      render: (item) => (
        <div>
          <span>{item.memory_capacity}</span>
          {item.memory_usage && (
            <span className="text-xs text-gray-500 ml-1">({item.memory_usage})</span>
          )}
        </div>
      ),
    },
    {
      key: "version",
      header: t("version"),
      render: (item) => item.version,
    },
    {
      key: "age",
      header: t("age"),
      render: (item) => item.age,
    },
  ];

  // 卡片视图配置
  const cardConfig: CardRenderConfig<NodeInfo> = {
    title: (item) => item.name,
    subtitle: (item) => `${item.cluster_name} • ${getRoleDisplay(item.roles, t)} • ${item.age}`,
    status: (item) => (
      <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
    ),
    content: (item) => (
      <div className="space-y-4">
        {/* IP 地址 */}
        <div className="text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">{t("internalIpLabel")}</span>
            <span>{item.internal_ip || t("notAvailable")}</span>
          </div>
          {item.external_ip && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{t("externalIpLabel")}</span>
              <span>{item.external_ip}</span>
            </div>
          )}
        </div>

        {/* 资源容量和使用情况 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Cpu className="h-4 w-4 mr-1 text-zinc-500" />
              <span className="text-sm">{t("cpu")}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{item.cpu_capacity}</div>
              {item.cpu_usage && (
                <div className="text-xs text-gray-500">{t("usedValue", { value: item.cpu_usage })}</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MemoryStick className="h-4 w-4 mr-1 text-green-500" />
              <span className="text-sm">{t("memory")}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{item.memory_capacity}</div>
              {item.memory_usage && (
                <div className="text-xs text-gray-500">{t("usedValue", { value: item.memory_usage })}</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <HardDrive className="h-4 w-4 mr-1 text-purple-500" />
              <span className="text-sm">Pods</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">
                {item.pods_usage || "0"}/{item.pods_capacity}
              </div>
              {item.pods_usage && (
                <div className="text-xs text-gray-500">
                  {Math.round(
                    (parseInt(item.pods_usage) / parseInt(item.pods_capacity || "1")) * 100
                  )}
                  {t("percentUsed")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 版本信息 */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {t("k8sVersionLabel", { version: item.version })}
        </div>
      </div>
    ),
  };

  return (
    <ResourceList<NodeInfo>
      resourceType={t("resourceType")}
      title={t("title")}
      description={t("description")}
      icon={Server}
      columns={columns}
      actions={[]}
      fetchFn={fetchNodesApi}
      requireNamespace={false}
      defaultViewMode="card"
      cardConfig={cardConfig}
      allowViewToggle={true}
      searchFields={["name", "status", "internal_ip"]}
      statusFilter={{
        field: "status",
        options: [
          { value: "Ready", label: t("ready") },
          { value: "NotReady", label: t("notReady") },
        ],
      }}
      emptyText={t("noNodesDescription")}
    />
  );
}

export default function NodesPage() {
  return (
    <AuthGuard>
      <NodesPageContent />
    </AuthGuard>
  );
}
