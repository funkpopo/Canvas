"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getChartColor } from "@/lib/chart-colors";

interface SeriesConfig {
  key: string;
  label: string;
  color?: string;
}

interface BarChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  layout?: "horizontal" | "vertical";
  showGrid?: boolean;
  showLegend?: boolean;
  stacked?: boolean;
  barSize?: number;
  className?: string;
  colorByIndex?: boolean;
}

export function BarChart({
  data,
  xKey,
  series,
  height = 300,
  layout = "horizontal",
  showGrid = true,
  showLegend = true,
  stacked = false,
  barSize,
  className,
  colorByIndex = false,
}: BarChartProps) {
  if (!data.length) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground text-sm ${className ?? ""}`} style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
          {layout === "horizontal" ? (
            <>
              <XAxis dataKey={xKey} className="text-xs" tick={{ fontSize: 12 }} />
              <YAxis className="text-xs" tick={{ fontSize: 12 }} />
            </>
          ) : (
            <>
              <XAxis type="number" className="text-xs" tick={{ fontSize: 12 }} />
              <YAxis dataKey={xKey} type="category" className="text-xs" tick={{ fontSize: 12 }} width={80} />
            </>
          )}
          <Tooltip contentStyle={{ fontSize: 12 }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? getChartColor(i)}
              stackId={stacked ? "stack" : undefined}
              barSize={barSize}
              radius={[2, 2, 0, 0]}
            >
              {colorByIndex &&
                data.map((_, idx) => (
                  <Cell key={idx} fill={getChartColor(idx)} />
                ))}
            </Bar>
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
