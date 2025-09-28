"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Settings, Zap, Globe, ChevronsLeft, ChevronsRight, Server, FolderTree, Package, Rss } from "lucide-react";

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

  // Only keep top-level entries that are not cluster-scoped
  const navItems = useMemo(
    () => [
      { name: "Clusters", href: "/clusters", icon: Globe },
      // Dashboard removed from sidebar; selecting a cluster navigates to "/"
      // Cluster-scoped sections (Nodes/Namespaces/Workloads/Events) are shown under each Cluster
      { name: "Settings", href: "/settings", icon: Settings },
    ],
    [],
  );

  // Helper to determine active state for links (exact or nested paths)
  const isPathActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Cluster-scoped roots to highlight/expand when visiting their pages
  const clusterScopedRoots = ["/nodes", "/namespaces", "/workloads", "/events"] as const;
  const onClusterScopedPage = clusterScopedRoots.some((root) => isPathActive(root));

  // Auto-open the Clusters section when navigating to cluster-scoped pages
  useEffect(() => {
    if (onClusterScopedPage) setClustersOpen(true);
  }, [onClusterScopedPage]);

  return (
    <aside
      className={cn(
        "border-r border-border bg-surface flex-shrink-0 h-screen sticky top-0 transition-all duration-200",
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
        </div>

        <nav className="flex-1 space-y-1 px-2 py-2 overflow-y-auto">
          {/* Clusters tree */}
          <div>
            <button
              onClick={() => setClustersOpen((v) => !v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isPathActive("/clusters") || onClusterScopedPage
                  ? "bg-accent text-accent-foreground"
                  : "text-text-muted hover:bg-muted hover:text-text-primary",
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
                      <div key={c.id} className="space-y-1">
                        <button
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
                        {isActive && (
                          <div className="ml-2 space-y-1">
                            {/* Cluster-scoped section links nested under the active cluster */}
                            <Link
                              href="/nodes"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/nodes")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="Nodes"
                            >
                              <Server className="h-4 w-4" />
                              <span>Nodes</span>
                            </Link>
                            <Link
                              href="/namespaces"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/namespaces")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="Namespaces"
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>Namespaces</span>
                            </Link>
                            <Link
                              href="/workloads"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/workloads")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="Workloads"
                            >
                              <Package className="h-4 w-4" />
                              <span>Workloads</span>
                            </Link>
                            <Link
                              href="/events"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/events")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="Events"
                            >
                              <Rss className="h-4 w-4" />
                              <span>Events</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Link href="/clusters" className="block rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-primary">
                    No clusters – add one
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Remaining sections (non cluster-scoped) */}
          {navItems.filter((n) => n.name !== "Clusters").map((item) => {
            const isActive = isPathActive(item.href);
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

        <div className="mt-auto border-t border-border p-2">
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-text-muted hover:bg-muted hover:text-text-primary flex items-center justify-between"
            onClick={() => setCollapsed((v) => !v)}
          >
            {!collapsed && <span>Collapse</span>}
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

