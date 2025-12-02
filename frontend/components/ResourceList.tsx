"use client";

import { useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ArrowLeft, RefreshCw, Plus, LucideIcon } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { BatchOperations, ItemCheckbox, BatchOperationItem } from "@/components/BatchOperations";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { namespaceApi } from "@/lib/api";
import { toast } from "sonner";

// ============ 类型定义 ============

/** 基础资源接口 - 所有 K8s 资源都应该有的字段 */
export interface BaseResource extends BatchOperationItem {
  id: string;
  name: string;
  namespace: string;
  cluster_id: number;
  cluster_name: string;
  age: string;
  labels?: Record<string, string>;
}

/** 列定义 */
export interface ColumnDef<T> {
  /** 列标识符 */
  key: string;
  /** 列标题 */
  header: string;
  /** 单元格渲染函数 */
  render: (item: T) => ReactNode;
  /** 列宽度 class */
  className?: string;
  /** 是否可排序 */
  sortable?: boolean;
}

/** 操作按钮定义 */
export interface ActionDef<T> {
  /** 操作标识符 */
  key: string;
  /** 按钮图标 */
  icon: LucideIcon;
  /** 提示文字 */
  tooltip?: string;
  /** 按钮变体 */
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  /** 是否危险操作 */
  danger?: boolean;
  /** 操作处理函数 */
  onClick: (item: T) => void;
  /** 是否显示此操作 */
  visible?: (item: T) => boolean;
  /** 是否禁用 */
  disabled?: (item: T) => boolean;
}

/** 批量操作支持配置 */
export interface BatchOperationSupport {
  delete?: boolean;
  restart?: boolean;
  label?: boolean;
}

/** API 响应类型 */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/** 删除确认对话框配置 */
export interface DeleteConfirmConfig {
  title: string;
  description: (item: BaseResource) => string;
  showForceOption?: boolean;
}

/** ResourceList 组件属性 */
export interface ResourceListProps<T extends BaseResource> {
  /** 资源类型标识 */
  resourceType: string;
  /** 页面标题 */
  title: string;
  /** 页面描述 */
  description: string;
  /** 页面图标 */
  icon?: LucideIcon;
  /** 列定义 */
  columns: ColumnDef<T>[];
  /** 操作按钮定义 */
  actions?: ActionDef<T>[];
  /** 获取资源列表的 API 函数 */
  fetchFn: (clusterId: number, namespace?: string) => Promise<ApiResponse<T[]>>;
  /** 删除资源的 API 函数 */
  deleteFn?: (clusterId: number, namespace: string, name: string) => Promise<ApiResponse<unknown>>;
  /** 批量删除资源的 API 函数 */
  batchDeleteFn?: (items: T[]) => Promise<void>;
  /** 批量重启资源的 API 函数 */
  batchRestartFn?: (items: T[]) => Promise<void>;
  /** 批量操作支持配置 */
  batchOperations?: BatchOperationSupport;
  /** 搜索字段（用于过滤） */
  searchFields?: (keyof T)[];
  /** 状态筛选配置 */
  statusFilter?: {
    field: keyof T;
    options: { value: string; label: string }[];
  };
  /** 是否需要命名空间选择器 */
  requireNamespace?: boolean;
  /** 默认命名空间 */
  defaultNamespace?: string;
  /** 创建按钮配置 */
  createButton?: {
    label: string;
    onClick: () => void;
    /** 是否有权限创建 */
    canCreate?: boolean;
  };
  /** 详情页链接生成函数 */
  detailLink?: (item: T) => string;
  /** 删除确认配置 */
  deleteConfirm?: DeleteConfirmConfig;
  /** 空状态文本 */
  emptyText?: string;
  /** 搜索占位符 */
  searchPlaceholder?: string;
  /** 额外的头部操作区域 */
  headerActions?: ReactNode;
  /** 自定义 ID 生成函数 */
  getItemId?: (item: T) => string;
  /** WebSocket 更新回调 */
  onUpdate?: () => void;
}

// ============ 工具函数 ============

/** 生成资源唯一 ID */
export function generateResourceId<T extends BaseResource>(item: T): string {
  return `${item.cluster_id}-${item.namespace}-${item.name}`;
}

/** 状态 Badge 变体映射 */
export function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const statusLower = status.toLowerCase();
  if (["running", "active", "ready", "succeeded", "healthy"].includes(statusLower)) {
    return "default";
  }
  if (["pending", "updating", "progressing", "unknown"].includes(statusLower)) {
    return "secondary";
  }
  if (["failed", "error", "crashloopbackoff", "terminated", "unhealthy"].includes(statusLower)) {
    return "destructive";
  }
  return "outline";
}

// ============ 主组件 ============

export function ResourceList<T extends BaseResource>({
  resourceType,
  title,
  description,
  icon: Icon,
  columns,
  actions = [],
  fetchFn,
  deleteFn,
  batchDeleteFn,
  batchRestartFn,
  batchOperations = {},
  searchFields = ["name" as keyof T],
  statusFilter,
  requireNamespace = true,
  defaultNamespace = "default",
  createButton,
  detailLink,
  deleteConfirm,
  emptyText,
  searchPlaceholder,
  headerActions,
  getItemId = generateResourceId,
  onUpdate,
}: ResourceListProps<T>) {
  // ============ 状态 ============
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>(defaultNamespace);
  const [namespaces, setNamespaces] = useState<string[]>([]);

  // 删除确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: "default" | "destructive";
    showForceOption?: boolean;
    forceOption?: boolean;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    variant: "destructive",
    showForceOption: false,
    forceOption: false,
  });

  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { clusters } = useCluster();

  // ============ 数据获取 ============

  /** 获取命名空间列表 */
  const fetchNamespaces = useCallback(async () => {
    if (!selectedClusterId) return;
    try {
      const result = await namespaceApi.getNamespaces(selectedClusterId);
      if (result.data) {
        const namespaceNames = (result.data as { name: string }[]).map((ns) => ns.name);
        setNamespaces(namespaceNames);
      } else {
        setNamespaces(["default"]);
      }
    } catch {
      setNamespaces(["default"]);
    }
  }, [selectedClusterId]);

  /** 获取资源列表 */
  const fetchItems = useCallback(async () => {
    if (!selectedClusterId) return;
    if (requireNamespace && !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await fetchFn(
        selectedClusterId,
        requireNamespace ? selectedNamespace : undefined
      );

      if (response.data) {
        // 为每个资源添加唯一 ID
        const itemsWithIds = response.data.map((item) => ({
          ...item,
          id: getItemId(item),
        }));
        setItems(itemsWithIds);
      } else if (response.error) {
        toast.error(`获取${resourceType}列表失败: ${response.error}`);
      }
    } catch {
      toast.error(`获取${resourceType}列表失败`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClusterId, selectedNamespace, requireNamespace, fetchFn, resourceType, getItemId]);

  // ============ Effects ============

  // 初始化集群选择
  useEffect(() => {
    if (user && clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [user, clusters, selectedClusterId]);

  // 集群变化时获取命名空间
  useEffect(() => {
    if (selectedClusterId && requireNamespace) {
      fetchNamespaces();
    }
  }, [selectedClusterId, requireNamespace, fetchNamespaces]);

  // 集群/命名空间变化时获取资源
  useEffect(() => {
    if (selectedClusterId) {
      if (requireNamespace && selectedNamespace) {
        fetchItems();
      } else if (!requireNamespace) {
        fetchItems();
      }
    }
  }, [selectedClusterId, selectedNamespace, requireNamespace, fetchItems]);

  // ============ 过滤逻辑 ============

  const filteredItems = items.filter((item) => {
    // 搜索过滤
    const matchesSearch = searchFields.some((field) => {
      const value = item[field];
      if (typeof value === "string") {
        return value.toLowerCase().includes(searchTerm.toLowerCase());
      }
      return false;
    });

    // 状态过滤
    let matchesStatus = true;
    if (statusFilter && selectedStatus !== "all") {
      const statusValue = item[statusFilter.field];
      if (typeof statusValue === "string") {
        matchesStatus = statusValue.toLowerCase() === selectedStatus.toLowerCase();
      }
    }

    return matchesSearch && matchesStatus;
  });

  // ============ 事件处理 ============

  /** 处理删除 */
  const handleDelete = (item: T) => {
    if (!deleteFn) return;

    const config = deleteConfirm || {
      title: `删除${resourceType}`,
      description: (i: BaseResource) => `确定要删除${resourceType} "${i.name}" 吗？此操作不可撤销。`,
    };

    setConfirmDialog({
      open: true,
      title: config.title,
      description: config.description(item),
      onConfirm: async () => {
        try {
          const result = await deleteFn(item.cluster_id, item.namespace, item.name);
          if (!result.error) {
            toast.success(`${resourceType}删除成功`);
            fetchItems();
          } else {
            toast.error(`删除${resourceType}失败: ${result.error}`);
          }
        } catch {
          toast.error(`删除${resourceType}失败`);
        }
      },
      variant: "destructive",
      showForceOption: config.showForceOption,
      forceOption: false,
    });
  };

  /** 处理批量删除 */
  const handleBatchDelete = async (selectedItemsData: T[]) => {
    if (batchDeleteFn) {
      await batchDeleteFn(selectedItemsData);
      fetchItems();
    } else if (deleteFn) {
      // 逐个删除
      for (const item of selectedItemsData) {
        const result = await deleteFn(item.cluster_id, item.namespace, item.name);
        if (result.error) {
          throw new Error(`删除 ${item.namespace}/${item.name} 失败`);
        }
      }
      toast.success(`批量删除成功，共删除 ${selectedItemsData.length} 个${resourceType}`);
      fetchItems();
    }
  };

  /** 处理批量重启 */
  const handleBatchRestart = async (selectedItemsData: T[]) => {
    if (batchRestartFn) {
      await batchRestartFn(selectedItemsData);
      fetchItems();
    }
  };

  // ============ 渲染 ============

  // 认证检查
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">请先登录</h2>
          <Button onClick={() => router.push("/login")}>前往登录</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回仪表板</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector
                value={selectedClusterId?.toString() || ""}
                onValueChange={(value) => setSelectedClusterId(value ? parseInt(value) : null)}
              />
              {requireNamespace && (
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="选择命名空间" />
                  </SelectTrigger>
                  <SelectContent>
                    {namespaces.map((ns) => (
                      <SelectItem key={ns} value={ns}>
                        {ns}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={fetchItems} variant="outline" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
            {Icon && <Icon className="h-8 w-8 mr-3" />}
            {title}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{description}</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{resourceType}列表</CardTitle>
                <CardDescription>
                  {requireNamespace
                    ? selectedNamespace
                      ? `命名空间: ${selectedNamespace}`
                      : "请选择命名空间"
                    : `共 ${filteredItems.length} 个${resourceType}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {headerActions}
                {createButton && createButton.canCreate !== false && (
                  <Button onClick={createButton.onClick} disabled={requireNamespace && !selectedNamespace}>
                    <Plus className="w-4 h-4 mr-2" />
                    {createButton.label}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 搜索和筛选 */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder || `搜索${resourceType}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              {statusFilter && (
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="状态筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {statusFilter.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 内容区域 */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="ml-2">加载中...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm
                  ? `未找到匹配的${resourceType}`
                  : emptyText || (requireNamespace && !selectedNamespace)
                    ? `请选择命名空间查看${resourceType}`
                    : `暂无${resourceType}`}
              </div>
            ) : (
              <>
                {/* 批量操作 */}
                {(batchOperations.delete || batchOperations.restart || batchOperations.label) && (
                  <BatchOperations
                    items={filteredItems}
                    selectedItems={selectedItems}
                    onSelectionChange={setSelectedItems}
                    onBatchDelete={batchOperations.delete ? handleBatchDelete : undefined}
                    onBatchRestart={batchOperations.restart ? handleBatchRestart : undefined}
                    resourceType={resourceType}
                    supportedOperations={batchOperations}
                  />
                )}

                {/* 表格 */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {(batchOperations.delete || batchOperations.restart || batchOperations.label) && (
                          <TableHead className="w-12"></TableHead>
                        )}
                        {columns.map((col) => (
                          <TableHead key={col.key} className={col.className}>
                            {col.header}
                          </TableHead>
                        ))}
                        {actions.length > 0 && <TableHead>操作</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow
                          key={item.id}
                          className={detailLink ? "cursor-pointer hover:bg-muted/50" : ""}
                          onClick={detailLink ? () => router.push(detailLink(item)) : undefined}
                        >
                          {(batchOperations.delete || batchOperations.restart || batchOperations.label) && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <ItemCheckbox
                                itemId={item.id}
                                isSelected={selectedItems.includes(item.id)}
                                onChange={(itemId, checked) => {
                                  if (checked) {
                                    setSelectedItems([...selectedItems, itemId]);
                                  } else {
                                    setSelectedItems(selectedItems.filter((id) => id !== itemId));
                                  }
                                }}
                              />
                            </TableCell>
                          )}
                          {columns.map((col) => (
                            <TableCell key={col.key} className={col.className}>
                              {col.render(item)}
                            </TableCell>
                          ))}
                          {actions.length > 0 && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {actions.map((action) => {
                                  const visible = action.visible ? action.visible(item) : true;
                                  const disabled = action.disabled ? action.disabled(item) : false;
                                  if (!visible) return null;

                                  const ActionIcon = action.icon;
                                  return (
                                    <Button
                                      key={action.key}
                                      variant={action.variant || "outline"}
                                      size="sm"
                                      onClick={() => action.onClick(item)}
                                      disabled={disabled}
                                      className={action.danger ? "text-red-600 hover:text-red-700" : ""}
                                      title={action.tooltip}
                                    >
                                      <ActionIcon className="w-4 h-4" />
                                    </Button>
                                  );
                                })}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
        showForceOption={confirmDialog.showForceOption}
        forceOption={confirmDialog.forceOption}
        onForceOptionChange={(checked) =>
          setConfirmDialog((prev) => ({ ...prev, forceOption: checked }))
        }
      />
    </div>
  );
}

// ============ 预定义列渲染器 ============

/** 名称列 */
export function NameColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "name",
    header: "名称",
    render: (item) => <span className="font-medium">{item.name}</span>,
  };
}

/** 命名空间列 */
export function NamespaceColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "namespace",
    header: "命名空间",
    render: (item) => item.namespace,
  };
}

/** 集群列 */
export function ClusterColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "cluster",
    header: "集群",
    render: (item) => item.cluster_name,
  };
}

/** 年龄列 */
export function AgeColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "age",
    header: "年龄",
    render: (item) => item.age,
  };
}

/** 状态列 */
export function StatusColumn<T extends BaseResource & { status?: string }>(
  getStatus?: (item: T) => string
): ColumnDef<T> {
  return {
    key: "status",
    header: "状态",
    render: (item) => {
      const status = getStatus ? getStatus(item) : item.status || "Unknown";
      return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>;
    },
  };
}

/** 标签列 */
export function LabelsColumn<T extends BaseResource>(): ColumnDef<T> {
  return {
    key: "labels",
    header: "标签",
    render: (item) => {
      const labels = item.labels || {};
      const labelCount = Object.keys(labels).length;
      if (labelCount === 0) return "-";
      return (
        <Badge variant="outline" title={JSON.stringify(labels, null, 2)}>
          {labelCount} 个标签
        </Badge>
      );
    },
  };
}

export default ResourceList;
