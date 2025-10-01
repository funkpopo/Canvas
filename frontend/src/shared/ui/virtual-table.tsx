"use client";

import React, { ReactElement, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export type VirtualTableProps = {
  height?: number;
  estimateSize?: number;
  overscan?: number;
  count: number;
  renderHeader: () => ReactElement;
  renderRow: (index: number) => ReactElement; // must return a <tr>
  className?: string;
};

export function VirtualTable({
  height = 480,
  estimateSize = 40,
  overscan = 8,
  count,
  renderHeader,
  renderRow,
  className,
}: VirtualTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className={`overflow-auto rounded-md border border-border mt-2 ${className ?? ""}`}
      style={{ height }}
    >
      <table className="w-full text-sm">
        <thead className="bg-muted">{renderHeader()}</thead>
        <tbody style={{ position: "relative" }}>
          <tr>
            <td style={{ height: totalSize, padding: 0 }} />
          </tr>
          {virtualRows.map((vr) => {
            const rowEl = renderRow(vr.index);
            // Inject absolute positioning for virtualization
            const style = {
              ...(rowEl.props?.style ?? {}),
              position: "absolute" as const,
              top: 0,
              transform: `translateY(${vr.start}px)`,
              width: "100%",
            };
            return React.cloneElement(rowEl, { key: rowEl.key ?? `row-${vr.index}`, style });
          })}
        </tbody>
      </table>
    </div>
  );
}

