import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { BatchOperationItem } from "@/components/BatchOperations";

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

/** 视图模式 */
export type ViewMode = "table" | "card";

/** 卡片渲染器定义 */
export interface CardRenderConfig<T> {
  /** 卡片标题渲染 */
  title: (item: T) => ReactNode;
  /** 卡片副标题/描述渲染 */
  subtitle?: (item: T) => ReactNode;
  /** 卡片状态 Badge 渲染 */
  status?: (item: T) => ReactNode;
  /** 卡片内容渲染 */
  content: (item: T) => ReactNode;
  /** 卡片操作按钮渲染 (可选，不提供则使用 actions) */
  actions?: (item: T, defaultActions: ReactNode) => ReactNode;
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
  /** 列定义 (表格视图) */
  columns: ColumnDef<T>[];
  /** 操作按钮定义 */
  actions?: ActionDef<T>[];
  /** 获取资源列表的 API 函数（非分页） */
  fetchFn?: (clusterId: number, namespace?: string) => Promise<ApiResponse<T[]>>;
  /** 分页获取资源列表的 API 函数（用于大数据量） */
  fetchPageFn?: (
    clusterId: number,
    namespace: string | undefined,
    continueToken: string | null,
    limit: number
  ) => Promise<ApiResponse<{ items: T[]; continue_token: string | null }>>;
  /** 分页大小（仅在 fetchPageFn 存在时生效） */
  pageSize?: number;
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
  /** 是否允许选择“全部命名空间” */
  allowAllNamespaces?: boolean;
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
  /** 默认视图模式 */
  defaultViewMode?: ViewMode;
  /** 卡片渲染配置 (启用卡片视图) */
  cardConfig?: CardRenderConfig<T>;
  /** 是否允许切换视图模式 */
  allowViewToggle?: boolean;
  /** 额外的头部状态区域 (如 WebSocket 连接状态) */
  statusBadge?: ReactNode;
  /** 命名空间选项来源: 'api' 从 API 获取, 'data' 从数据中提取 */
  namespaceSource?: "api" | "data";
  /** 是否在集群选择器旁显示命名空间选择器 */
  showNamespaceInHeader?: boolean;
}


