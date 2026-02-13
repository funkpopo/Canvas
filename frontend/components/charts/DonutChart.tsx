"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { getChartColor } from "@/lib/chart-colors";

interface DonutDataItem {
  name: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutDataItem[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}

export function DonutChart({
  data,
  height = 250,
  innerRadius = 60,
  outerRadius = 90,
  showLegend = true,
  centerLabel,
  centerValue,
  className,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (!total) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground text-sm ${className ?? ""}`} style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={entry.color ?? getChartColor(index)}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value}`, name]}
            contentStyle={{ fontSize: 12 }}
          />
          {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {(centerLabel || centerValue !== undefined) && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {centerValue !== undefined && (
                <tspan
                  x="50%"
                  dy="-0.5em"
                  className="fill-foreground text-2xl font-semibold"
                >
                  {centerValue}
                </tspan>
              )}
              {centerLabel && (
                <tspan
                  x="50%"
                  dy={centerValue !== undefined ? "1.5em" : "0"}
                  className="fill-muted-foreground text-xs"
                >
                  {centerLabel}
                </tspan>
              )}
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
