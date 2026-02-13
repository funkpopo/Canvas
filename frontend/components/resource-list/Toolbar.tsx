"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, LayoutGrid, List, RefreshCw } from "lucide-react";
import type { ViewMode } from "./types";
import { useTranslations } from "@/hooks/use-translations";

export interface ResourceListToolbarProps {
  resourceType: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  statusFilter?: {
    field: string;
    options: { value: string; label: string }[];
  };
  selectedStatus: string;
  onStatusChange: (value: string) => void;
  activeFilterTags: string[];
  onResetFilters: () => void;
  headerActions?: ReactNode;
  createButton?: {
    label: string;
    onClick: () => void;
    canCreate?: boolean;
    disabled?: boolean;
  };
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showViewToggle: boolean;
  // Namespace selector props
  namespaces?: string[];
  selectedNamespace?: string;
  onNamespaceChange?: (ns: string) => void;
  allowAllNamespaces?: boolean;
  // Refresh props
  onRefresh?: () => void;
  isFetching?: boolean;
}

export function ResourceListToolbar({
  resourceType,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  statusFilter,
  selectedStatus,
  onStatusChange,
  activeFilterTags,
  onResetFilters,
  headerActions,
  createButton,
  viewMode,
  onViewModeChange,
  showViewToggle,
  namespaces,
  selectedNamespace,
  onNamespaceChange,
  allowAllNamespaces,
  onRefresh,
  isFetching,
}: ResourceListToolbarProps) {
  const t = useTranslations("resourceList");
  const hasActiveFilters = activeFilterTags.length > 0;

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1">
        {/* Namespace selector */}
        {namespaces && namespaces.length > 0 && onNamespaceChange && (
          <Select value={selectedNamespace || "__all__"} onValueChange={(v) => onNamespaceChange(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("allNamespaces")} />
            </SelectTrigger>
            <SelectContent>
              {allowAllNamespaces && (
                <SelectItem value="__all__">{t("allNamespaces")}</SelectItem>
              )}
              {namespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>{ns}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder || t("searchPlaceholder", { resourceType })}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        {statusFilter && (
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t("statusFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              {statusFilter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isFetching} aria-label={t("refresh")}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        )}
        {headerActions}
        {createButton && createButton.canCreate !== false && (
          <Button onClick={createButton.onClick} disabled={createButton.disabled}>
            <Plus className="w-4 h-4 mr-2" />
            {createButton.label}
          </Button>
        )}
        {showViewToggle && (
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("card")}
              className="rounded-r-none"
              aria-label={t("switchToCardView")}
              title={t("switchToCardView")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("table")}
              className="rounded-l-none"
              aria-label={t("switchToTableView")}
              title={t("switchToTableView")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      </div>
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{t("appliedFilters")}:</span>
          {activeFilterTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={onResetFilters}>
            {t("resetFilters")}
          </Button>
        </div>
      )}
    </div>
  );
}
