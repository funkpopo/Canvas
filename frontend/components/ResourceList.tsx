"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { BatchOperations } from "@/components/BatchOperations";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { namespaceApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { toast } from "sonner";
import { type InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { BaseResource, ResourceListProps, ViewMode } from "./resource-list/types";
import { generateResourceId } from "./resource-list/utils";
import { ResourceListCardView } from "./resource-list/CardView";
import { ResourceListTableView } from "./resource-list/TableView";
import { ResourceListToolbar } from "./resource-list/Toolbar";

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
  pageSize = 100,
  deleteFn,
  batchDeleteFn,
  batchRestartFn,
  batchOperations = {},
  searchFields = ["name" as keyof T],
  statusFilter,
  requireNamespace = true,
  allowAllNamespaces = true,
  defaultNamespace = "",
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
  const tCommon = useTranslations("common");
  const tResource = useTranslations("resourceList");

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
    toast.error(tResource("loadNamespacesFailed", { message: namespacesQuery.error.message }));
  }, [namespacesQuery.errorUpdatedAt, tResource]);

  const itemsQueryEnabled =
    !!selectedClusterId &&
    (namespaceSource === "data" || !requireNamespace || allowAllNamespaces || !!selectedNamespace);

  const itemsQueryKey = useMemo(
    () => [
      "resourceList",
      resourceType,
      selectedClusterId,
      namespaceSource,
      requireNamespace ? selectedNamespace : "",
      requireNamespace,
      allowAllNamespaces,
    ],
    [resourceType, selectedClusterId, namespaceSource, requireNamespace, selectedNamespace, allowAllNamespaces]
  );

  type ItemWithId = T & { id: string };

  const namespaceParam =
    namespaceSource === "data"
      ? undefined
      : requireNamespace
      ? selectedNamespace || undefined
      : undefined;

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
      const resp = await fetchPageFn(selectedClusterId as number, namespaceParam, pageParam, pageSize);
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
    toast.error(tResource("loadListFailed", { resourceType, message: err.message }));
  }, [
    resourceType,
    isPaginated,
    itemsQuery.errorUpdatedAt,
    paginatedQuery.errorUpdatedAt,
    tResource,
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
        setNamespaces([]);
      }
      return;
    }

    // namespaceSource === "data"
    const uniqueNamespaces = Array.from(
      new Set(items.map((item) => item.namespace).filter(Boolean))
    ) as string[];
    setNamespaces(uniqueNamespaces);
  }, [namespaceSource, namespacesQuery.data, namespacesQuery.isLoading, requireNamespace, items]);

  useEffect(() => {
    if (!requireNamespace) return;

    const hasNamespace = (value: string) => value !== "" && namespaces.includes(value);
    const preferredNamespace = hasNamespace(defaultNamespace)
      ? defaultNamespace
      : namespaces[0] ?? "";

    if (allowAllNamespaces) {
      if (selectedNamespace && !hasNamespace(selectedNamespace)) {
        setSelectedNamespace("");
      }
      return;
    }

    if (!selectedNamespace || !hasNamespace(selectedNamespace)) {
      setSelectedNamespace(preferredNamespace);
    }
  }, [requireNamespace, allowAllNamespaces, selectedNamespace, namespaces, defaultNamespace]);

  // ============ 过滤逻辑 ============

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const statusLower = selectedStatus.toLowerCase();

    return items.filter((item) => {
      // 命名空间过滤 (当从数据中提取命名空间时)
      if (namespaceSource === "data" && selectedNamespace && item.namespace !== selectedNamespace) {
        return false;
      }

      // 搜索过滤
      const matchesSearch = searchFields.some((field) => {
        const value = item[field];
        if (typeof value === "string") {
          // term 为空时认为匹配，避免每行多一次 includes("") 的开销
          return term === "" ? true : value.toLowerCase().includes(term);
        }
        return false;
      });

      // 状态过滤
      let matchesStatus = true;
      if (statusFilter && statusLower !== "all") {
        const statusValue = item[statusFilter.field];
        if (typeof statusValue === "string") {
          matchesStatus = statusValue.toLowerCase() === statusLower;
        }
      }

      return matchesSearch && matchesStatus;
    });
  }, [items, namespaceSource, selectedNamespace, searchFields, searchTerm, statusFilter, selectedStatus]);

  const activeFilterTags = useMemo(() => {
    const tags: string[] = [];

    const term = searchTerm.trim();
    if (term) {
      tags.push(tResource("filterSearch", { value: term }));
    }

    if (selectedStatus !== "all" && statusFilter) {
      const statusLabel =
        statusFilter.options.find((option) => option.value === selectedStatus)?.label || selectedStatus;
      tags.push(tResource("filterStatus", { value: statusLabel }));
    }

    if (selectedNamespace && allowAllNamespaces) {
      tags.push(tResource("filterNamespace", { value: selectedNamespace }));
    }

    return tags;
  }, [searchTerm, selectedStatus, statusFilter, selectedNamespace, allowAllNamespaces, tResource]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedStatus("all");
    if (allowAllNamespaces) {
      setSelectedNamespace("");
    } else if (requireNamespace && namespaces.length > 0) {
      setSelectedNamespace(defaultNamespace || namespaces[0]);
    }
  };

  const batchOpsEnabled = !!(batchOperations.delete || batchOperations.restart || batchOperations.label);

  // ============ 事件处理 ============

  /** 处理删除 */
  const handleDelete = (item: T) => {
    if (!deleteFn) return;

    const config = deleteConfirm || {
      title: tResource("deleteTitle", { resourceType }),
      description: (i: BaseResource) =>
        tResource("deleteDescription", { resourceType, name: i.name }),
      showForceOption: false,
    };

    setConfirmDialog({
      open: true,
      title: config.title,
      description: config.description(item),
      onConfirm: async () => {
        try {
          const result = await deleteFn(item.cluster_id, item.namespace, item.name);
          if (!result.error) {
            toast.success(tResource("deleteSuccess", { resourceType }));
            await refetchItems();
          } else {
            toast.error(tResource("deleteFailed", { resourceType, message: result.error }));
          }
        } catch {
          toast.error(tResource("deleteFailedGeneric", { resourceType }));
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
          throw new Error(tResource("deleteItemFailed", { item: `${item.namespace}/${item.name}` }));
        }
      }
      toast.success(tResource("batchDeleteSuccess", { count: selectedItemsData.length, resourceType }));
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
          <h2 className="text-2xl font-bold mb-4">{tResource("loginRequiredTitle")}</h2>
          <Button onClick={() => router.push("/login")}>{tResource("goToLogin")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Title */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold flex items-center">
              {Icon && <Icon className="h-6 w-6 mr-2" />}
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
          <span className="text-lg">{tCommon("loading")}</span>
        </div>
      ) : filteredItems.length === 0 ? (
        /* 空状态 */
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          {Icon && <Icon className="h-12 w-12 text-muted-foreground mb-4" />}
          <h3 className="text-lg font-medium mb-2">
            {activeFilterTags.length > 0
              ? tResource("noMatchingItems", { resourceType })
              : tResource("noItems", { resourceType })}
          </h3>
          <p className="text-muted-foreground mb-4">
            {activeFilterTags.length > 0
              ? tResource("emptyFilteredHint")
              : emptyText || tResource("createFirstItem", { resourceType })}
          </p>
          {activeFilterTags.length > 0 && (
            <Button variant="outline" onClick={handleResetFilters} className="mb-3">
              {tResource("resetFilters")}
            </Button>
          )}
          {createButton && createButton.canCreate !== false && (
            <Button onClick={createButton.onClick}>
              <Plus className="h-4 w-4 mr-2" />
              {createButton.label}
            </Button>
          )}
        </div>
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

          {/* 工具栏：命名空间、搜索、筛选、视图切换 */}
          <ResourceListToolbar
            resourceType={resourceType}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder={searchPlaceholder}
            statusFilter={statusFilter ? { field: String(statusFilter.field), options: statusFilter.options } : undefined}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            activeFilterTags={activeFilterTags}
            onResetFilters={handleResetFilters}
            headerActions={headerActions}
            createButton={createButton ? {
              ...createButton,
              disabled:
                namespaceSource === "api" &&
                requireNamespace &&
                !allowAllNamespaces &&
                !selectedNamespace,
            } : undefined}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showViewToggle={!!cardConfig && allowViewToggle}
            namespaces={requireNamespace ? namespaces : undefined}
            selectedNamespace={selectedNamespace}
            onNamespaceChange={requireNamespace ? setSelectedNamespace : undefined}
            allowAllNamespaces={allowAllNamespaces}
            onRefresh={() => refetchItems()}
            isFetching={isFetching}
          />

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
                      {tCommon("loading")}
                    </>
                  ) : hasNextPage ? (
                    tResource("loadMore")
                  ) : (
                    tResource("noMore")
                  )}
                </Button>
              </div>
            )}
          </>
        )}

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
