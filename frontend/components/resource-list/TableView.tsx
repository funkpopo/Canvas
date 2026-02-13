"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemCheckbox } from "@/components/BatchOperations";
import { useTranslations } from "@/hooks/use-translations";
import type { ActionDef, BaseResource, ColumnDef } from "./types";

export interface ResourceListTableViewProps<T extends BaseResource> {
  resourceType: string;
  items: T[];
  columns: ColumnDef<T>[];
  actions: ActionDef<T>[];
  selectedItems: string[];
  onSelectionChange: (ids: string[]) => void;
  batchOpsEnabled: boolean;
  selectedNamespace?: string;
  onRowClick?: (item: T) => void;
  virtualizeThreshold?: number;
}

export function ResourceListTableView<T extends BaseResource>({
  resourceType,
  items,
  columns,
  actions,
  selectedItems,
  onSelectionChange,
  batchOpsEnabled,
  selectedNamespace,
  onRowClick,
  virtualizeThreshold = 200,
}: ResourceListTableViewProps<T>) {
  const t = useTranslations("resourceList");
  const widthStorageKey = `resource-list-table-widths:${resourceType}`;

  // ============ 表格虚拟滚动 (大数据量优化) ============
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const headerCellRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(600);
  const [cachedColumnWidths, setCachedColumnWidths] = useState<Record<string, number>>({});

  const tableColSpan = columns.length + (batchOpsEnabled ? 1 : 0) + (actions.length > 0 ? 1 : 0);
  const shouldVirtualizeTable = items.length > virtualizeThreshold;
  const tableRowHeight = 44; // px，接近 TableRow 默认高度
  const tableOverscan = 8;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(widthStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setCachedColumnWidths(parsed as Record<string, number>);
      }
    } catch {
      // ignore invalid cache
    }
  }, [widthStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(widthStorageKey, JSON.stringify(cachedColumnWidths));
  }, [cachedColumnWidths, widthStorageKey]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const update = () => setTableViewportHeight(el.clientHeight || 600);
    update();

    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const next: Record<string, number> = {};

    const selectCell = headerCellRefs.current.get("__select");
    if (selectCell) next["__select"] = Math.round(selectCell.getBoundingClientRect().width);

    for (const col of columns) {
      const cell = headerCellRefs.current.get(col.key);
      if (!cell) continue;
      next[col.key] = Math.round(cell.getBoundingClientRect().width);
    }

    const actionsCell = headerCellRefs.current.get("__actions");
    if (actionsCell) next["__actions"] = Math.round(actionsCell.getBoundingClientRect().width);

    if (Object.keys(next).length === 0) return;

    setCachedColumnWidths((prev) => {
      let changed = false;
      const merged = { ...prev };
      for (const [key, value] of Object.entries(next)) {
        if (!value) continue;
        if (Math.abs((merged[key] ?? 0) - value) > 2) {
          merged[key] = value;
          changed = true;
        }
      }
      return changed ? merged : prev;
    });
  }, [columns, items.length, tableViewportHeight]);

  const { virtualItems, paddingTop, paddingBottom } = useMemo(() => {
    if (!shouldVirtualizeTable) {
      return {
        virtualItems: items,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const total = items.length;
    const startIndex = Math.max(0, Math.floor(tableScrollTop / tableRowHeight) - tableOverscan);
    const endIndex = Math.min(
      total,
      Math.ceil((tableScrollTop + tableViewportHeight) / tableRowHeight) + tableOverscan
    );

    return {
      virtualItems: items.slice(startIndex, endIndex),
      paddingTop: startIndex * tableRowHeight,
      paddingBottom: (total - endIndex) * tableRowHeight,
    };
  }, [items, shouldVirtualizeTable, tableScrollTop, tableViewportHeight]);

  const toggleSelection = (itemId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedItems, itemId]);
    } else {
      onSelectionChange(selectedItems.filter((id) => id !== itemId));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("listTitle", { resourceType })}</CardTitle>
            <CardDescription>
              {t("totalItems", { count: items.length, resourceType })}
              {selectedNamespace && ` · ${t("namespace")}: ${selectedNamespace}`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={tableContainerRef}
          className="overflow-auto max-h-[70vh]"
          onScroll={(e) => {
            const top = (e.currentTarget as HTMLDivElement).scrollTop;
            if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
            scrollRafRef.current = requestAnimationFrame(() => setTableScrollTop(top));
          }}
        >
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {batchOpsEnabled && (
                  <TableHead
                    ref={(el) => {
                      headerCellRefs.current.set("__select", el);
                    }}
                    className="w-12"
                    style={cachedColumnWidths.__select ? { width: `${cachedColumnWidths.__select}px` } : undefined}
                  />
                )}
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    ref={(el) => {
                      headerCellRefs.current.set(col.key, el);
                    }}
                    className={col.className}
                    style={cachedColumnWidths[col.key] ? { width: `${cachedColumnWidths[col.key]}px` } : undefined}
                  >
                    {col.header}
                  </TableHead>
                ))}
                {actions.length > 0 && (
                  <TableHead
                    ref={(el) => {
                      headerCellRefs.current.set("__actions", el);
                    }}
                    style={cachedColumnWidths.__actions ? { width: `${cachedColumnWidths.__actions}px` } : undefined}
                  >
                    {t("actions")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shouldVirtualizeTable && paddingTop > 0 && (
                <TableRow>
                  <TableCell colSpan={tableColSpan} className="p-0" style={{ height: paddingTop }} />
                </TableRow>
              )}

              {virtualItems.map((item) => (
                <TableRow
                  key={item.id}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                >
                  {batchOpsEnabled && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ItemCheckbox
                        itemId={item.id}
                        isSelected={selectedItems.includes(item.id)}
                        onChange={toggleSelection}
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
                              aria-label={action.tooltip || t("actionFallback", { action: action.key })}
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

              {shouldVirtualizeTable && paddingBottom > 0 && (
                <TableRow>
                  <TableCell colSpan={tableColSpan} className="p-0" style={{ height: paddingBottom }} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}


