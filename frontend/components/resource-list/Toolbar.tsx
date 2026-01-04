"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, LayoutGrid, List } from "lucide-react";
import type { ViewMode } from "./types";

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
}

export function ResourceListToolbar({
  resourceType,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  statusFilter,
  selectedStatus,
  onStatusChange,
  headerActions,
  createButton,
  viewMode,
  onViewModeChange,
  showViewToggle,
}: ResourceListToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder || `搜索${resourceType}...`}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        {statusFilter && (
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {statusFilter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-2">
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
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("table")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
