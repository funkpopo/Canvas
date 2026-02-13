"use client";

import { Cpu, MemoryStick } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RingGauge } from "@/components/charts/RingGauge";

interface NodeMetrics {
  name: string;
  cpu_usage: string;
  memory_usage: string;
  cpu_percentage: number;
  memory_percentage: number;
  timestamp: string;
}

interface NodeCardProps {
  node: NodeMetrics;
  clusterName?: string;
}

export function NodeCard({ node, clusterName }: NodeCardProps) {
  return (
    <Card className="py-4 px-4 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{node.name}</span>
        {clusterName && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {clusterName}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-4">
        <RingGauge value={node.cpu_percentage} label="CPU" size={90} />
        <RingGauge
          value={node.memory_percentage}
          label="Mem"
          size={90}
          color={
            node.memory_percentage >= 80
              ? "#ef4444"
              : node.memory_percentage >= 60
                ? "#f59e0b"
                : "#22c55e"
          }
        />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3" />
          <span>CPU: {node.cpu_usage}</span>
          <span className="ml-auto tabular-nums">{node.cpu_percentage.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MemoryStick className="h-3 w-3" />
          <span>Mem: {node.memory_usage}</span>
          <span className="ml-auto tabular-nums">{node.memory_percentage.toFixed(1)}%</span>
        </div>
      </div>
    </Card>
  );
}

export type { NodeMetrics };
