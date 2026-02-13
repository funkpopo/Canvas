"use client";

import { useCluster } from "@/lib/cluster-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";

interface ClusterSelectorProps {
  value?: string;
  onValueChange?: (value: string) => void;
}

export default function ClusterSelector({ value, onValueChange }: ClusterSelectorProps) {
  const t = useTranslations("common");
  const { clusters, activeCluster, setActiveCluster, refreshClusters, isLoading } = useCluster();

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">{t("loadingClusters")}</span>
      </div>
    );
  }

  const activeClusters = (clusters.filter(c => c.is_active).length > 0)
    ? clusters.filter(c => c.is_active)
    : clusters;

  if (activeClusters.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">{t("noClusters")}</span>
        <button onClick={refreshClusters} className="text-xs text-muted-foreground underline ml-2">
          {t("refresh")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Select
        value={value || activeCluster?.id.toString() || ""}
        onValueChange={(value) => {
          if (onValueChange) {
            onValueChange(value);
          } else {
            const cluster = clusters.find(c => c.id.toString() === value);
            setActiveCluster(cluster || null);
          }
        }}
      >
        <SelectTrigger className="min-w-40 max-w-56">
          <SelectValue placeholder={t("selectCluster")}>
            {activeCluster && (
              <div className="flex items-center space-x-2 min-w-0">
                <span className="truncate">{activeCluster.name}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {clusters.map((cluster) => (
            <SelectItem key={cluster.id} value={cluster.id.toString()}>
              <div className="flex flex-col min-w-0">
                <span className="truncate">{cluster.name}</span>
                <span className="text-xs text-muted-foreground truncate">{cluster.endpoint}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
