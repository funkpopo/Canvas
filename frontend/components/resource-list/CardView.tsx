"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemCheckbox } from "@/components/BatchOperations";
import type { ActionDef, BaseResource, CardRenderConfig } from "./types";

export interface ResourceListCardViewProps<T extends BaseResource> {
  items: T[];
  actions: ActionDef<T>[];
  cardConfig: CardRenderConfig<T>;
  batchOpsEnabled: boolean;
  selectedItems: string[];
  onSelectionChange: (ids: string[]) => void;
  onCardClick?: (item: T) => void;
  virtualizeThreshold?: number;
}

export function ResourceListCardView<T extends BaseResource>({
  items,
  actions,
  cardConfig,
  batchOpsEnabled,
  selectedItems,
  onSelectionChange,
  onCardClick,
  virtualizeThreshold = 100,
}: ResourceListCardViewProps<T>) {
  // ============ 虚拟滚动 ============
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [columns, setColumns] = useState(3);

  const shouldVirtualize = items.length > virtualizeThreshold;
  const cardHeight = 220; // 估算卡片高度
  const gap = 24;
  const rowHeight = cardHeight + gap;
  const overscan = 2;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      setViewportHeight(el.clientHeight || 800);
      const width = el.clientWidth || 1200;
      setColumns(width >= 1024 ? 3 : width >= 768 ? 2 : 1);
    };
    updateDimensions();

    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const { virtualItems, paddingTop, paddingBottom } = useMemo(() => {
    if (!shouldVirtualize) {
      return { virtualItems: items, paddingTop: 0, paddingBottom: 0 };
    }

    const totalRows = Math.ceil(items.length / columns);
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

    const startIndex = startRow * columns;
    const endIndex = Math.min(items.length, endRow * columns);

    return {
      virtualItems: items.slice(startIndex, endIndex),
      paddingTop: startRow * rowHeight,
      paddingBottom: Math.max(0, (totalRows - endRow) * rowHeight),
    };
  }, [items, shouldVirtualize, scrollTop, viewportHeight, columns, rowHeight]);

  const toggleSelection = (itemId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedItems, itemId]);
    } else {
      onSelectionChange(selectedItems.filter((id) => id !== itemId));
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => setScrollTop(top));
  };

  return (
    <div
      ref={containerRef}
      className={shouldVirtualize ? "overflow-auto max-h-[70vh]" : ""}
      onScroll={shouldVirtualize ? handleScroll : undefined}
    >
      {shouldVirtualize && paddingTop > 0 && <div style={{ height: paddingTop }} />}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {virtualItems.map((item) => {
        const defaultActionsNode =
          actions.length > 0 ? (
            <div className="flex justify-end space-x-2">
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
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick(item);
                    }}
                    disabled={disabled}
                    className={action.danger ? "text-red-600 hover:text-red-700" : ""}
                    title={action.tooltip}
                  >
                    <ActionIcon className="w-4 h-4" />
                  </Button>
                );
              })}
            </div>
          ) : null;

        return (
          <Card
            key={item.id}
            className={`hover:shadow-lg transition-shadow ${onCardClick ? "cursor-pointer" : ""}`}
            onClick={onCardClick ? () => onCardClick(item) : undefined}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {batchOpsEnabled && (
                    <ItemCheckbox
                      itemId={item.id}
                      isSelected={selectedItems.includes(item.id)}
                      onChange={toggleSelection}
                    />
                  )}
                  <CardTitle className="text-lg truncate max-w-[200px]" title={item.name}>
                    {cardConfig.title(item)}
                  </CardTitle>
                </div>
                {cardConfig.status && cardConfig.status(item)}
              </div>
              {cardConfig.subtitle && <CardDescription>{cardConfig.subtitle(item)}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cardConfig.content(item)}
                {cardConfig.actions ? cardConfig.actions(item, defaultActionsNode) : defaultActionsNode}
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>
      {shouldVirtualize && paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
    </div>
  );
}


