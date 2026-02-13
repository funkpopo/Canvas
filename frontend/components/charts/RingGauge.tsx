"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

interface RingGaugeProps {
  value: number;
  label: string;
  size?: number;
  color?: string;
  className?: string;
}

function getGaugeColor(value: number): string {
  if (value >= 80) return "#ef4444";
  if (value >= 60) return "#f59e0b";
  return "#3b82f6";
}

export function RingGauge({
  value,
  label,
  size = 100,
  color,
  className,
}: RingGaugeProps) {
  const fillColor = color ?? getGaugeColor(value);
  const data = [{ value: Math.min(Math.max(value, 0), 100) }];

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          data={data}
          barSize={8}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: "hsl(var(--muted))" }}
            dataKey="value"
            cornerRadius={4}
            fill={fillColor}
            angleAxisId={0}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold tabular-nums leading-none">
          {Math.round(value)}%
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  );
}
