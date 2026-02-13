"use client";

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getChartColor } from "@/lib/chart-colors";

interface SeriesConfig {
  key: string;
  label: string;
  color?: string;
}

interface LineChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  showDots?: boolean;
  yDomain?: [number | string, number | string];
  tooltipFormatter?: (value: number, name: string) => [string, string];
  className?: string;
}

export function LineChart({
  data,
  xKey,
  series,
  height = 300,
  showGrid = true,
  showLegend = true,
  showDots = false,
  yDomain,
  tooltipFormatter,
  className,
}: LineChartProps) {
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
        <RechartsLineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
          <XAxis dataKey={xKey} className="text-xs" tick={{ fontSize: 12 }} />
          <YAxis className="text-xs" tick={{ fontSize: 12 }} domain={yDomain} />
          {tooltipFormatter ? (
            <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12 }} />
          ) : (
            <Tooltip contentStyle={{ fontSize: 12 }} />
          )}
          {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? getChartColor(i)}
              strokeWidth={2}
              dot={showDots}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
