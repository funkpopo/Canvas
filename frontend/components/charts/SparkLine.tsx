"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { getChartColor } from "@/lib/chart-colors";

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function SparkLine({
  data,
  width = 80,
  height = 32,
  color,
  className,
}: SparkLineProps) {
  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <div className={className} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color ?? getChartColor(0)}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
