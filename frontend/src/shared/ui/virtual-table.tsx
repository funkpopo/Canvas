"use client";

import React, { ReactElement, ReactNode, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ColumnDef<T = any> = {
  key: string;
  header: ReactNode;
  width?: string | number;
  minWidth?: string | number;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  onSort?: () => void;
  sortDirection?: "asc" | "desc" | null;
  render: (row: T, index: number) => ReactNode;
  tooltip?: (row: T) => string | undefined;
  className?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VirtualTableProps<T = any> = {
  height?: number;
  estimateSize?: number;
  overscan?: number;
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T, index: number) => void;
  rowKey?: (row: T, index: number) => string;
  renderCustomRow?: (row: T, index: number) => ReactElement | null;
  className?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function VirtualTable<T = any>({
  height = 480,
  estimateSize = 40,
  overscan = 8,
  data,
  columns,
  onRowClick,
  rowKey,
  renderCustomRow,
  className,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    measureElement: (el) => (el as HTMLElement).getBoundingClientRect().height,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Calculate minimum table width based on fixed-width columns and min-width columns
  const tableMinWidth = columns.reduce((sum, col) => {
    if (col.width) {
      if (typeof col.width === 'number') return sum + col.width;
      if (typeof col.width === 'string' && col.width.endsWith('px')) {
        return sum + parseInt(col.width);
      }
    } else if (col.minWidth) {
      if (typeof col.minWidth === 'number') return sum + col.minWidth;
      if (typeof col.minWidth === 'string' && col.minWidth.endsWith('px')) {
        return sum + parseInt(col.minWidth);
      }
    }
    return sum;
  }, 0);

  const renderHeader = () => (
    <tr className="text-left text-text-muted">
      {columns.map((col, idx) => {
        const style: React.CSSProperties = {
          boxSizing: 'border-box',
          overflow: 'hidden',
        };
        const widthValue = typeof col.width === 'number' ? `${col.width}px` : col.width;
        const minWidthValue = typeof col.minWidth === 'number' ? `${col.minWidth}px` : col.minWidth;
        
        if (widthValue) {
          // Fixed width column
          style.width = widthValue;
          style.minWidth = widthValue;
          style.maxWidth = widthValue;
        } else if (minWidthValue) {
          // Flexible column with minimum width
          style.minWidth = minWidthValue;
        }
        if (col.align) style.textAlign = col.align;

        return (
          <th
            key={col.key || idx}
            className={`px-3 py-2 align-middle ${col.sortable ? "cursor-pointer select-none" : ""} ${col.className || ""}`}
            style={style}
            onClick={col.sortable ? col.onSort : undefined}
            aria-sort={col.sortable && col.sortDirection ? (col.sortDirection === "asc" ? "ascending" : "descending") : undefined}
          >
            <div className="flex items-center gap-1">
              {col.header}
              {col.sortable && col.sortDirection && (
                <span className="text-xs">{col.sortDirection === "asc" ? "▲" : "▼"}</span>
              )}
            </div>
          </th>
        );
      })}
    </tr>
  );

  const renderRow = (index: number) => {
    const row = data[index];
    if (!row) return <tr key={`empty-${index}`} />;

    const customRow = renderCustomRow?.(row, index);
    if (customRow) return customRow;

    const key = rowKey ? rowKey(row, index) : `row-${index}`;

    return (
      <tr
        key={key}
        className={`border-t border-border hover:bg-hover ${onRowClick ? "cursor-pointer" : ""}`}
        onClick={() => onRowClick?.(row, index)}
      >
        {columns.map((col, colIdx) => {
          const style: React.CSSProperties = {
            boxSizing: 'border-box',
            overflow: 'hidden',
          };
          const widthValue = typeof col.width === 'number' ? `${col.width}px` : col.width;
          const minWidthValue = typeof col.minWidth === 'number' ? `${col.minWidth}px` : col.minWidth;
          
          if (widthValue) {
            // Fixed width column
            style.width = widthValue;
            style.minWidth = widthValue;
            style.maxWidth = widthValue;
          } else if (minWidthValue) {
            // Flexible column with minimum width
            style.minWidth = minWidthValue;
          }
          if (col.align) style.textAlign = col.align;

          const content = col.render(row, index);
          const tooltipText = col.tooltip?.(row);

          return (
            <td
              key={col.key || colIdx}
              className={`px-3 py-2 align-middle ${col.className || ""}`}
              style={style}
            >
              {tooltipText ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate">{content}</div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs break-words">{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                content
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div
      ref={parentRef}
      className={`overflow-auto rounded-md border border-border mt-2 ${className ?? ""}`}
      style={{ height }}
    >
      <table 
        className="w-full text-sm" 
        style={{ 
          tableLayout: 'fixed',
          width: '100%',
          minWidth: tableMinWidth > 0 ? `${tableMinWidth}px` : undefined,
          borderCollapse: 'collapse',
          borderSpacing: 0,
        }}
      >
        <colgroup>
          {columns.map((col, idx) => {
            const colStyle: React.CSSProperties = {};
            if (col.width) {
              colStyle.width = typeof col.width === 'number' ? `${col.width}px` : col.width;
            } else if (col.minWidth) {
              colStyle.minWidth = typeof col.minWidth === 'number' ? `${col.minWidth}px` : col.minWidth;
            }
            return (
              <col
                key={col.key || idx}
                style={colStyle}
              />
            );
          })}
        </colgroup>
        <thead className="bg-muted sticky top-0 z-10">{renderHeader()}</thead>
        <tbody style={{ position: "relative", width: '100%' }}>
          <tr style={{ height: totalSize, display: 'table', width: '100%', tableLayout: 'fixed' }}>
            <td style={{ padding: 0, border: 0 }} colSpan={columns.length} />
          </tr>
          {virtualRows.map((vr) => {
            const rowEl = renderRow(vr.index);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rowAny = rowEl as any;
            const style = {
              ...(rowAny.props?.style ?? {}),
              position: "absolute" as const,
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vr.start}px)`,
              width: '100%',
              display: 'table',
              tableLayout: 'fixed',
            };
            return React.cloneElement(rowAny, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              key: (rowAny as any).key ?? `row-${vr.index}`,
              style,
              ref: rowVirtualizer.measureElement,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          })}
        </tbody>
      </table>
    </div>
  );
}

