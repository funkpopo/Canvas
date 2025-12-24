"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, ArrowLeft, RefreshCw, Plus, LayoutGrid, List } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { BatchOperations } from "@/components/BatchOperations";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { namespaceApi } from "@/lib/api";
import { toast } from "sonner";
import { type InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { BaseResource, ResourceListProps, ViewMode } from "./resource-list/types";
import { generateResourceId } from "./resource-list/utils";
import { ResourceListCardView } from "./resource-list/CardView";
import { ResourceListTableView } from "./resource-list/TableView";

export type {
  ActionDef,
  ApiResponse,
  BaseResource,
  BatchOperationSupport,
  CardRenderConfig,
  ColumnDef,
  DeleteConfirmConfig,
  ResourceListProps,
  ViewMode,
} from "./resource-list/types";
export { generateResourceId, getStatusBadgeVariant } from "./resource-list/utils";
export { AgeColumn, ClusterColumn, LabelsColumn, NameColumn, NamespaceColumn, StatusColumn } from "./resource-list/columns";

// ============ 主组件 ============

export function ResourceList<T extends BaseResource>({
  resourceType,
  title,
  description,
  icon: Icon,
  columns,
  actions = [],
  fetchFn,
  fetchPageFn,
  pageSize = 200,
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
  defaultViewMode = "table",
  cardConfig,
  allowViewToggle = true,
  statusBadge,
  namespaceSource = "api",
  showNamespaceInHeader = false,
}: ResourceListProps<T>) {
  // ============ 状态 ============
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>(requireNamespace ? defaultNamespace : "");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(cardConfig ? defaultViewMode : "table");

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
  const { clusters, activeCluster } = useCluster();

  // ============ 数据获取 ============

  const namespacesQuery = useQuery<string[], Error>({
    queryKey: ["namespaces", selectedClusterId],
    enabled: !!selectedClusterId && requireNamespace && namespaceSource === "api",
    queryFn: async () => {
      const result = await namespaceApi.getNamespaces(selectedClusterId as number);
      if (result.error) {
        throw new Error(result.error);
      }
      const list = (result.data ?? []) as { name: string }[];
      return list.map((ns) => ns.name);
    },
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!namespacesQuery.error) return;
    toast.error(`获取命名空间失败: ${namespacesQuery.error.message}`);
  }, [namespacesQuery.errorUpdatedAt]);

  const itemsQueryEnabled =
    !!selectedClusterId &&
    (namespaceSource === "data" || !requireNamespace || (requireNamespace && !!selectedNamespace));

  const itemsQueryKey = useMemo(
    () => [
      "resourceList",
      resourceType,
      selectedClusterId,
      namespaceSource,
      requireNamespace ? selectedNamespace : "",
      requireNamespace,
    ],
    [resourceType, selectedClusterId, namespaceSource, requireNamespace, selectedNamespace]
  );

  type ItemWithId = T & { id: string };

  const namespaceParam =
    namespaceSource === "data" ? undefined : requireNamespace ? selectedNamespace : undefined;

  const isPaginated = !!fetchPageFn;

  const itemsQuery = useQuery<ItemWithId[], Error>({
    queryKey: itemsQueryKey,
    enabled: itemsQueryEnabled && !isPaginated,
    queryFn: async () => {
      if (!fetchFn) return [];
      const response = await fetchFn(selectedClusterId as number, namespaceParam);
      if (response.error) throw new Error(response.error);
      const data = response.data ?? [];
      return data.map((item) => ({ ...item, id: getItemId(item) }));
    },
    placeholderData: (previousData) => previousData,
  });

  const paginatedQuery = useInfiniteQuery<
    { items: ItemWithId[]; continue_token: string | null },
    Error,
    InfiniteData<{ items: ItemWithId[]; continue_token: string | null }, string | null>,
    (string | number | boolean | null)[],
    string | null
  >({
    queryKey: [...itemsQueryKey, "infinite", pageSize],
    enabled: itemsQueryEnabled && isPaginated,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!fetchPageFn) return { items: [], continue_token: null };
      const resp = await fetchPageFn(selectedClusterId as number, namespaceParam, pageParam);
      if (resp.error) throw new Error(resp.error);
      const data = resp.data ?? { items: [], continue_token: null };
      return {
        items: (data.items ?? []).map((item) => ({ ...item, id: getItemId(item) })),
        continue_token: data.continue_token ?? null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.continue_token ?? undefined,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    const err = isPaginated ? paginatedQuery.error : itemsQuery.error;
    if (!err) return;
    toast.error(`获取${resourceType}列表失败: ${err.message}`);
  }, [
    resourceType,
    isPaginated,
    itemsQuery.errorUpdatedAt,
    paginatedQuery.errorUpdatedAt,
  ]);

  const items = useMemo(() => {
    if (!isPaginated) return itemsQuery.data ?? [];
    return paginatedQuery.data?.pages.flatMap((p) => p.items) ?? [];
  }, [isPaginated, itemsQuery.data, paginatedQuery.data]);

  const isLoading = authLoading || (isPaginated ? paginatedQuery.isLoading : itemsQuery.isLoading);
  const isFetching = isPaginated ? paginatedQuery.isFetching : itemsQuery.isFetching;
  const hasNextPage = isPaginated ? !!paginatedQuery.hasNextPage : false;
  const isFetchingNextPage = isPaginated ? paginatedQuery.isFetchingNextPage : false;
  const fetchNextPage = isPaginated ? paginatedQuery.fetchNextPage : undefined;
  const refetchItems = isPaginated ? paginatedQuery.refetch : itemsQuery.refetch;

  // ============ Effects ============

  // 初始化集群选择 - 优先使用 activeCluster
  useEffect(() => {
    if (user && !selectedClusterId) {
      if (activeCluster) {
        setSelectedClusterId(activeCluster.id);
      } else if (clusters.length > 0) {
        setSelectedClusterId(clusters[0].id);
      }
    }
  }, [user, clusters, activeCluster, selectedClusterId]);

  // 同步命名空间列表
  useEffect(() => {
    if (namespaceSource === "api") {
      if (namespacesQuery.data && namespacesQuery.data.length > 0) {
        setNamespaces(namespacesQuery.data);
      } else if (!namespacesQuery.isLoading && requireNamespace) {
        setNamespaces(["default"]);
      }
      return;
    }

    // namespaceSource === "data"
    const uniqueNamespaces = Array.from(
      new Set(items.map((item) => item.namespace).filter(Boolean))
    ) as string[];
    setNamespaces(uniqueNamespaces);
  }, [namespaceSource, namespacesQuery.data, namespacesQuery.isLoading, requireNamespace, items]);

  // ============ 过滤逻辑 ============

  const filteredItems = items.filter((item) => {
    // 命名空间过滤 (当从数据中提取命名空间时)
    if (namespaceSource === "data" && selectedNamespace && item.namespace !== selectedNamespace) {
      return false;
    }

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

  const batchOpsEnabled = !!(batchOperations.delete || batchOperations.restart || batchOperations.label);

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
            await refetchItems();
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
      await refetchItems();
    } else if (deleteFn) {
      // 逐个删除
      for (const item of selectedItemsData) {
        const result = await deleteFn(item.cluster_id, item.namespace, item.name);
        if (result.error) {
          throw new Error(`删除 ${item.namespace}/${item.name} 失败`);
        }
      }
      toast.success(`批量删除成功，共删除 ${selectedItemsData.length} 个${resourceType}`);
      await refetchItems();
    }
  };

  /** 处理批量重启 */
  const handleBatchRestart = async (selectedItemsData: T[]) => {
    if (batchRestartFn) {
      await batchRestartFn(selectedItemsData);
      await refetchItems();
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
              {/* 命名空间选择器 (Header 模式 或 从数据提取) */}
              {(showNamespaceInHeader || namespaceSource === "data") && namespaces.length > 0 && (
                <Select
                  value={selectedNamespace || "all"}
                  onValueChange={(value) => setSelectedNamespace(value === "all" ? "" : value)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="选择命名空间" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部命名空间</SelectItem>
                    {namespaces.map((ns) => (
                      <SelectItem key={ns} value={ns}>
                        {ns}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* 命名空间选择器 (卡片内模式，从 API 获取) */}
              {!showNamespaceInHeader && namespaceSource === "api" && requireNamespace && (
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
              <Button onClick={() => refetchItems()} variant="outline" disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
                {Icon && <Icon className="h-8 w-8 mr-3" />}
                {title}
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">{description}</p>
            </div>
            <div className="flex items-center space-x-2">
              {statusBadge}
            </div>
          </div>
        </div>

        {/* 加载状态 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          /* 空状态 */
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              {Icon && <Icon className="h-12 w-12 text-gray-400 mb-4" />}
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {searchTerm ? `未找到匹配的${resourceType}` : `暂无${resourceType}`}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {emptyText || `开始创建您的第一个${resourceType}`}
              </p>
              {createButton && createButton.canCreate !== false && (
                <Button onClick={createButton.onClick}>
                  <Plus className="h-4 w-4 mr-2" />
                  {createButton.label}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          /* 内容区域 */
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

            {/* 工具栏：搜索、筛选、视图切换 */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-4 flex-1">
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
              <div className="flex items-center gap-2">
                {headerActions}
                {createButton && createButton.canCreate !== false && (
                  <Button onClick={createButton.onClick} disabled={namespaceSource === "api" && requireNamespace && !selectedNamespace}>
                    <Plus className="w-4 h-4 mr-2" />
                    {createButton.label}
                  </Button>
                )}
                {/* 视图切换按钮 */}
                {cardConfig && allowViewToggle && (
                  <div className="flex items-center border rounded-md">
                    <Button
                      variant={viewMode === "card" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("card")}
                      className="rounded-r-none"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("table")}
                      className="rounded-l-none"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* 卡片视图 */}
            {viewMode === "card" && cardConfig ? (
              <ResourceListCardView
                items={filteredItems}
                actions={actions}
                cardConfig={cardConfig}
                batchOpsEnabled={batchOpsEnabled}
                selectedItems={selectedItems}
                onSelectionChange={setSelectedItems}
                onCardClick={detailLink ? (item) => router.push(detailLink(item)) : undefined}
              />
            ) : (
              /* 表格视图 */
              <ResourceListTableView
                resourceType={resourceType}
                items={filteredItems}
                columns={columns}
                actions={actions}
                batchOpsEnabled={batchOpsEnabled}
                selectedItems={selectedItems}
                onSelectionChange={setSelectedItems}
                selectedNamespace={selectedNamespace}
                onRowClick={detailLink ? (item) => router.push(detailLink(item)) : undefined}
              />
            )}

            {/* 分页加载更多（大数据量） */}
            {fetchNextPage && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      加载中...
                    </>
                  ) : hasNextPage ? (
                    "加载更多"
                  ) : (
                    "没有更多了"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
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
export default ResourceList;
