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

  // ============ 表格虚拟滚动 (大数据量优化) ============
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(600);

  const tableColSpan = columns.length + (batchOpsEnabled ? 1 : 0) + (actions.length > 0 ? 1 : 0);
  const shouldVirtualizeTable = items.length > virtualizeThreshold;
  const tableRowHeight = 44; // px，接近 TableRow 默认高度
  const tableOverscan = 8;

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
                {batchOpsEnabled && <TableHead className="w-12"></TableHead>}
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    {col.header}
                  </TableHead>
                ))}
                {actions.length > 0 && <TableHead>{t("actions")}</TableHead>}
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


