"use client";

import React from "react";

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
  const width = 600; // logical width for viewBox; scales to 100% width
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
  const xTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / xTicks);

  const defaultFormatY = (v: number) =>
    v >= 1000 ? `${Math.round(v).toLocaleString()}` : `${v.toFixed(0)}`;
  const fmtY = formatY ?? defaultFormatY;
  const fmtX = (ms: number) => new Date(ms).toLocaleTimeString();

  return (
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
  );
}

