"use client";

import { useCluster } from "@/lib/cluster-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function ClusterSelector() {
  const { clusters, activeCluster, setActiveCluster, refreshClusters, isLoading } = useCluster();

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-gray-600">加载集群中...</span>
      </div>
    );
  }

  const activeClusters = (clusters.filter(c => c.is_active).length > 0)
    ? clusters.filter(c => c.is_active)
    : clusters;

  if (activeClusters.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">无活跃集群</span>
        <button onClick={refreshClusters} className="text-xs text-blue-600 underline ml-2">
          刷新
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm font-medium">当前集群:</span>
      <Select
        value={activeCluster?.id.toString() || ""}
        onValueChange={(value) => {
          const cluster = clusters.find(c => c.id.toString() === value);
          setActiveCluster(cluster || null);
        }}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="选择集群">
            {activeCluster && (
              <div className="flex items-center space-x-2">
                <span>{activeCluster.name}</span>
                <Badge variant="outline" className="text-xs">
                  {activeCluster.endpoint}
                </Badge>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {clusters.map((cluster) => (
            <SelectItem key={cluster.id} value={cluster.id.toString()}>
              <div className="flex flex-col">
                <span>{cluster.name}</span>
                <span className="text-xs text-gray-500">{cluster.endpoint}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
