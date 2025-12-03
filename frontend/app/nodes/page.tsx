"use client";

import { Badge } from "@/components/ui/badge";
import { Server, Cpu, MemoryStick, HardDrive } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { nodeApi, Node } from "@/lib/api";
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
function getRoleDisplay(roles: string[]) {
  if (roles.includes("master")) return "Master";
  if (roles.includes("worker")) return "Worker";
  return "Node";
}

function NodesPageContent() {
  // 列定义
  const columns: ColumnDef<NodeInfo>[] = [
    {
      key: "name",
      header: "名称",
      render: (item) => <span className="font-medium">{item.name}</span>,
    },
    {
      key: "status",
      header: "状态",
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: "role",
      header: "角色",
      render: (item) => getRoleDisplay(item.roles),
    },
    {
      key: "cluster",
      header: "集群",
      render: (item) => item.cluster_name,
    },
    {
      key: "internal_ip",
      header: "内部IP",
      render: (item) => item.internal_ip || "N/A",
    },
    {
      key: "cpu",
      header: "CPU",
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
      header: "内存",
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
      header: "版本",
      render: (item) => item.version,
    },
    {
      key: "age",
      header: "年龄",
      render: (item) => item.age,
    },
  ];

  // 卡片视图配置
  const cardConfig: CardRenderConfig<NodeInfo> = {
    title: (item) => item.name,
    subtitle: (item) => `${item.cluster_name} • ${getRoleDisplay(item.roles)} • ${item.age}`,
    status: (item) => (
      <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
    ),
    content: (item) => (
      <div className="space-y-4">
        {/* IP 地址 */}
        <div className="text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">内部IP:</span>
            <span>{item.internal_ip || "N/A"}</span>
          </div>
          {item.external_ip && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">外部IP:</span>
              <span>{item.external_ip}</span>
            </div>
          )}
        </div>

        {/* 资源容量和使用情况 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Cpu className="h-4 w-4 mr-1 text-zinc-500" />
              <span className="text-sm">CPU</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{item.cpu_capacity}</div>
              {item.cpu_usage && (
                <div className="text-xs text-gray-500">{item.cpu_usage} 已用</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MemoryStick className="h-4 w-4 mr-1 text-green-500" />
              <span className="text-sm">内存</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{item.memory_capacity}</div>
              {item.memory_usage && (
                <div className="text-xs text-gray-500">{item.memory_usage} 已用</div>
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
                  % 已用
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 版本信息 */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          K8s版本: {item.version}
        </div>
      </div>
    ),
  };

  return (
    <ResourceList<NodeInfo>
      resourceType="节点"
      title="节点管理"
      description="查看和管理Kubernetes集群中的节点资源"
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
          { value: "Ready", label: "Ready" },
          { value: "NotReady", label: "NotReady" },
        ],
      }}
      emptyText="没有找到任何节点信息"
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
