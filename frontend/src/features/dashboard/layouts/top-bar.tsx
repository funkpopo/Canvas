"use client";

import { useQuery } from "@tanstack/react-query";

import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { queryKeys, fetchClusterConfig } from "@/lib/api";

export function TopBar() {
  const { data: config } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-4">
        <div>
          <p className={`${badgePresets.label} text-text-muted`}>Active cluster</p>
          <p className="text-sm font-medium text-text-primary">
            {config?.api_server ? "Connected cluster" : "No cluster configured"}
          </p>
        </div>
        {config?.api_server && (
          <Badge
            variant="success-light"
            size="sm"
            className={badgePresets.status}
          >
            Online
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
      </div>
    </header>
  );
}




