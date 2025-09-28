"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Server,
  Folder,
  Layers,
  Activity,
  Settings,
  Zap,
  Globe,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { badgePresets } from "@/shared/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchClusterConfig, listClusterConfigs, queryKeys, selectActiveClusterByName } from "@/lib/api";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: active } = useQuery({ queryKey: queryKeys.clusterConfig, queryFn: fetchClusterConfig });
  const { data: clusters } = useQuery({ queryKey: queryKeys.clusterConfigsAll, queryFn: listClusterConfigs });

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [clustersOpen, setClustersOpen] = useState<boolean>(true);

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved != null) setCollapsed(saved === "1");
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const selectMutation = useMutation({
    mutationFn: async (name: string) => selectActiveClusterByName(name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfig }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.events }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workloads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterCapacity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterStorage }),
        queryClient.invalidateQueries({ queryKey: queryKeys.metricsStatus }),
      ]);
      router.push("/");
    },
  });

  const navItems = useMemo(
    () => [
      { name: "Clusters", href: "/clusters", icon: Globe },
      { name: "Dashboard", href: "/", icon: Home },
      { name: "Nodes", href: "/nodes", icon: Server },
      { name: "Namespaces", href: "/namespaces", icon: Folder },
      { name: "Workloads", href: "/workloads", icon: Layers },
      { name: "Events", href: "/events", icon: Activity },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
    [],
  );

  return (
    <aside
      className={cn(
        "border-r border-border bg-surface flex-shrink-0 sticky top-0 h-screen overflow-y-auto transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between px-3">
          <Link
            href="/"
            className={`flex items-center gap-3 text-sm font-semibold ${badgePresets.tag} text-text-primary`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            {!collapsed && <span>Canvas</span>}
          </Link>
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-2 text-text-muted hover:bg-muted hover:text-text-primary"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-2">
          {/* Clusters tree */}
          <div>
            <button
              onClick={() => setClustersOpen((v) => !v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/clusters" ? "bg-accent text-accent-foreground" : "text-text-muted hover:bg-muted hover:text-text-primary",
              )}
            >
              <Globe className="h-4 w-4" />
              {!collapsed && <span>Clusters</span>}
            </button>
            {clustersOpen && !collapsed && (
              <div className="mt-1 space-y-1 pl-9">
                {clusters && clusters.length > 0 ? (
                  clusters.map((c) => {
                    const isActive = active ? c.id === active.id : false;
                    return (
                      <button
                        key={c.id}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs",
                          isActive ? "bg-muted text-text-primary" : "text-text-muted hover:bg-muted hover:text-text-primary",
                        )}
                        disabled={selectMutation.isPending}
                        onClick={async () => {
                          await selectMutation.mutateAsync(c.name);
                        }}
                        title={c.name}
                      >
                        <span className="truncate">{c.name}</span>
                        {isActive && <span className="ml-2 text-[10px] text-primary">active</span>}
                      </button>
                    );
                  })
                ) : (
                  <Link href="/clusters" className="block rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-primary">
                    No clusters — add one
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Remaining sections */}
          {navItems.filter((n) => n.name !== "Clusters").map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-text-muted hover:bg-muted hover:text-text-primary",
                )}
                title={item.name}
              >
                <item.icon className="h-4 w-4" />
                {!collapsed && item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

