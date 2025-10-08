"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { ts: string | Date; value: number };

export function SimpleLineChart({
  data,
  stroke = "#4f46e5",
  height = 180,
  yLabel,
  formatY,
}: {
  data: Point[];
  stroke?: string;
  height?: number;
  yLabel?: string;
  formatY?: (v: number) => string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(600);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w && Math.abs(w - measuredWidth) > 1) setMeasuredWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [measuredWidth]);

  const width = Math.max(280, Math.round(measuredWidth));
  const margin = { top: 10, right: 12, bottom: 20, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const parsed = (data ?? []).map((d) => ({
    x: typeof d.ts === "string" ? new Date(d.ts).getTime() : d.ts.getTime(),
    y: d.value ?? 0,
  }));
  const xs = parsed.map((d) => d.x);
  const ys = parsed.map((d) => d.y);
  const xMin = xs.length ? Math.min(...xs) : Date.now() - 10 * 60 * 1000;
  const xMax = xs.length ? Math.max(...xs) : Date.now();
  const yMin = 0;
  const yMax = ys.length ? Math.max(...ys) : 1;

  const xScale = (x: number) =>
    margin.left + (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * innerW);
  const yScale = (y: number) =>
    margin.top + innerH - (yMax === yMin ? 0 : ((y - yMin) / (yMax - yMin)) * innerH);

  const path = parsed
    .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(d.x)},${yScale(d.y)}`)
    .join(" ");

  const yTicks = 4;
  const xTicks = useMemo(() => {
    // 1 tick roughly per ~160px, capped reasonably
    return Math.max(3, Math.min(8, Math.round(width / 160)));
  }, [width]);
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / xTicks);

  const defaultFormatY = (v: number) =>
    v >= 1000 ? `${Math.round(v).toLocaleString()}` : `${v.toFixed(0)}`;
  const fmtY = formatY ?? defaultFormatY;
  const fmtX = (ms: number) => new Date(ms).toLocaleTimeString();

  return (
    <div ref={wrapperRef} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height }}>
      <rect x={0} y={0} width={width} height={height} fill="none" />
      {/* Gridlines */}
      {yTickVals.map((v, i) => (
        <line
          key={`ygrid-${i}`}
          x1={margin.left}
          x2={width - margin.right}
          y1={yScale(v)}
          y2={yScale(v)}
          stroke="#e5e7eb"
          strokeWidth={1}
          opacity={0.5}
        />
      ))}
      {/* Axes */}
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      {/* Y ticks & labels */}
      {yTickVals.map((v, i) => (
        <g key={`ytick-${i}`}>
          <text x={margin.left - 6} y={yScale(v)} fill="#6b7280" fontSize={10} textAnchor="end" dy="0.32em">
            {fmtY(v)}
          </text>
        </g>
      ))}
      {/* X ticks & labels */}
      {xTickVals.map((v, i) => (
        <g key={`xtick-${i}`}>
          <line
            x1={xScale(v)}
            x2={xScale(v)}
            y1={height - margin.bottom}
            y2={height - margin.bottom + 4}
            stroke="#9ca3af"
          />
          <text x={xScale(v)} y={height - margin.bottom + 14} fill="#6b7280" fontSize={10} textAnchor="middle">
            {fmtX(v)}
          </text>
        </g>
      ))}
      {/* Y label */}
      {yLabel ? (
        <text x={margin.left} y={margin.top - 2} fill="#374151" fontSize={11} textAnchor="start">
          {yLabel}
        </text>
      ) : null}
      {/* Line */}
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
    </div>
  );
}

// Multi-line chart component
type LineConfig = {
  key: string;
  label: string;
  color: string;
};

export function LineChart({
  data,
  lines,
  xKey,
  height = 180,
  formatY,
}: {
  data: Record<string, unknown>[];
  lines: LineConfig[];
  xKey: string;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(600);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w && Math.abs(w - measuredWidth) > 1) setMeasuredWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [measuredWidth]);

  const width = Math.max(280, Math.round(measuredWidth));
  const margin = { top: 30, right: 12, bottom: 40, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Parse data and compute scales
  const parsed = useMemo(() => {
    return (data ?? []).map((d, idx) => {
      const point: Record<string, string | number> = { idx };
      // x value (assume string for categorical)
      point.x = d[xKey] ?? idx;
      // y values for each line
      lines.forEach((line) => {
        point[line.key] = Number(d[line.key]) || 0;
      });
      return point;
    });
  }, [data, xKey, lines]);

  // Collect all Y values to determine scale
  const allYs = useMemo(() => {
    const ys: number[] = [];
    parsed.forEach((p) => {
      lines.forEach((line) => {
        ys.push(p[line.key]);
      });
    });
    return ys;
  }, [parsed, lines]);

  const yMin = 0;
  const yMax = allYs.length ? Math.max(...allYs) : 1;

  // X scale (categorical/index based)
  const xScale = useCallback((idx: number) =>
    margin.left + (parsed.length > 1 ? (idx / (parsed.length - 1)) * innerW : innerW / 2),
    [parsed.length, innerW, margin.left]
  );

  const yScale = useCallback((y: number) =>
    margin.top + innerH - (yMax === yMin ? 0 : ((y - yMin) / (yMax - yMin)) * innerH),
    [margin.top, innerH, yMax, yMin]
  );

  // Generate paths for each line
  const paths = useMemo(() => {
    return lines.map((line) => {
      const pathData = parsed
        .map((p, i) => {
          const x = xScale(i);
          const y = yScale(p[line.key]);
          return `${i === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ");
      return { ...line, path: pathData };
    });
  }, [parsed, lines, xScale, yScale]);

  // Y ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  // X ticks (show subset of labels)
  const xTickIndices = useMemo(() => {
    const maxTicks = Math.max(3, Math.min(8, Math.round(width / 120)));
    if (parsed.length <= maxTicks) return parsed.map((_, i) => i);
    const step = Math.floor(parsed.length / maxTicks);
    return Array.from({ length: maxTicks }, (_, i) => Math.min(i * step, parsed.length - 1));
  }, [parsed, width]);

  const defaultFormatY = (v: number) =>
    v >= 1000 ? `${Math.round(v).toLocaleString()}` : `${v.toFixed(1)}`;
  const fmtY = formatY ?? defaultFormatY;

  return (
    <div ref={wrapperRef} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height }}>
        <rect x={0} y={0} width={width} height={height} fill="none" />
        
        {/* Gridlines */}
        {yTickVals.map((v, i) => (
          <line
            key={`ygrid-${i}`}
            x1={margin.left}
            x2={width - margin.right}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke="#e5e7eb"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}
        
        {/* Axes */}
        <line
          x1={margin.left}
          x2={margin.left}
          y1={margin.top}
          y2={height - margin.bottom}
          stroke="#9ca3af"
          strokeWidth={1}
        />
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={height - margin.bottom}
          y2={height - margin.bottom}
          stroke="#9ca3af"
          strokeWidth={1}
        />
        
        {/* Y ticks & labels */}
        {yTickVals.map((v, i) => (
          <g key={`ytick-${i}`}>
            <text x={margin.left - 6} y={yScale(v)} fill="#6b7280" fontSize={10} textAnchor="end" dy="0.32em">
              {fmtY(v)}
            </text>
          </g>
        ))}
        
        {/* X ticks & labels */}
        {xTickIndices.map((idx) => {
          const p = parsed[idx];
          if (!p) return null;
          return (
            <g key={`xtick-${idx}`}>
              <line
                x1={xScale(idx)}
                x2={xScale(idx)}
                y1={height - margin.bottom}
                y2={height - margin.bottom + 4}
                stroke="#9ca3af"
              />
              <text
                x={xScale(idx)}
                y={height - margin.bottom + 14}
                fill="#6b7280"
                fontSize={9}
                textAnchor="middle"
                style={{ maxWidth: "80px" }}
              >
                {p.x}
              </text>
            </g>
          );
        })}
        
        {/* Lines */}
        {paths.map((line) => (
          <path
            key={line.key}
            d={line.path}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        
        {/* Legend */}
        <g transform={`translate(${margin.left}, ${margin.top - 20})`}>
          {lines.map((line, i) => (
            <g key={line.key} transform={`translate(${i * 140}, 0)`}>
              <line x1={0} x2={20} y1={0} y2={0} stroke={line.color} strokeWidth={2} />
              <text x={25} y={0} fill="#374151" fontSize={11} dy="0.32em">
                {line.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
