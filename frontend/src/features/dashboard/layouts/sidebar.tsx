"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Settings, Zap, Globe, ChevronsLeft, ChevronsRight, Server, FolderTree, Package, Rss } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchClusterConfig, listClusterConfigs, queryKeys, selectActiveClusterByName, fetchClusterOverview } from "@/lib/api";
import { StatusBadge } from "@/shared/ui/status-badge";

export function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: active } = useQuery({ queryKey: queryKeys.clusterConfig, queryFn: fetchClusterConfig });
  const { data: clusters } = useQuery({ queryKey: queryKeys.clusterConfigsAll, queryFn: listClusterConfigs });
  const { data: overview } = useQuery({ queryKey: queryKeys.clusterOverview, queryFn: fetchClusterOverview });

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
      { name: t("sidebar.clusters"), href: "/clusters", icon: Globe },
      { name: t("sidebar.audit"), href: "/audit", icon: Rss },
      // Dashboard removed from sidebar; selecting a cluster navigates to "/"
      // Cluster-scoped sections (Nodes/Namespaces/Workloads/Events) are shown under each Cluster
      { name: t("sidebar.settings"), href: "/settings", icon: Settings },
    ],
    [t],
  );

  // Helper to determine active state for links (exact or nested paths)
  const isPathActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Cluster-scoped roots to highlight/expand when visiting their pages
  const clusterScopedRoots = ["/nodes", "/namespaces", "/workloads", "/events", "/pods", "/services"] as const;
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
            {!collapsed && <span>{t("sidebar.brand")}</span>}
          </Link>
        </div>
        {/* Active cluster quick status */}
        {!collapsed && active && overview && (
          <div className="px-3 pb-2">
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{t("sidebar.activeCluster")}</span>
                <span className="text-[10px] text-text-muted">{overview.kubernetes_version}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="truncate text-sm text-text-primary" title={active.name}>{active.name}</span>
                {(() => {
                  const ready = overview.ready_nodes ?? 0;
                  const total = overview.node_count ?? 0;
                  const status: "healthy" | "warning" | "critical" = total > 0 ? (ready === total ? "healthy" : (ready > 0 ? "warning" : "critical")) : "warning";
                  const label = status === "healthy" ? t("topbar.health.healthy") : status === "warning" ? t("topbar.health.degraded") : t("topbar.health.offline");
                  return <StatusBadge status={status} label={label} size="sm" />;
                })()}
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1 px-2 py-2 overflow-y-auto">
          {/* Clusters tree */}
          <div>
            <Link
              href="/clusters"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                // Only highlight when actually on /clusters; do not
                // treat cluster-scoped pages as active for this item.
                isPathActive("/clusters")
                  ? "bg-accent text-accent-foreground"
                  : "text-text-muted hover:bg-muted hover:text-text-primary",
              )}
            >
              <Globe className="h-4 w-4" />
              {!collapsed && <span>{t("sidebar.clusters")}</span>}
            </Link>
            {clustersOpen && !collapsed && (
              <div className="mt-1 space-y-1 pl-9">
                {clusters && clusters.length > 0 ? (
                  clusters.map((c) => {
                    const isActive = active ? c.id === active.id : false;
                    return (
                      <div key={c.id} className="space-y-1">
                        <button
                          className={cn(
                            // Increase cluster name font size for better readability
                            "flex w-full items-center justify-between rounded-md px-2 py-1 text-base border",
                            isActive
                              ? "border-primary text-text-primary"
                              : "border-transparent text-text-muted hover:text-text-primary",
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
                              title={t("sidebar.nodes")}
                            >
                              <Server className="h-4 w-4" />
                              <span>{t("sidebar.nodes")}</span>
                            </Link>
                            <Link
                              href="/namespaces"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/namespaces")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.namespaces")}
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>{t("sidebar.namespaces")}</span>
                            </Link>
                            <Link
                              href="/workloads"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/workloads")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.workloads")}
                            >
                              <Package className="h-4 w-4" />
                              <span>{t("sidebar.workloads")}</span>
                            </Link>
                            <Link
                              href="/pods"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/pods")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.pods")}
                            >
                              <Package className="h-4 w-4" />
                              <span>{t("sidebar.pods")}</span>
                            </Link>
                            <Link
                              href="/services"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/services")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.services")}
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>{t("sidebar.services")}</span>
                            </Link>
                            <Link
                              href="/crds"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/crds")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.crds")}
                            >
                              <Package className="h-4 w-4" />
                              <span>{t("sidebar.crds")}</span>
                            </Link>
                            <Link
                              href="/network/ingresses"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/network/ingresses")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="Ingresses"
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>Ingresses</span>
                            </Link>
                            <Link
                              href="/network/policies"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/network/policies")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="NetworkPolicies"
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>NetworkPolicies</span>
                            </Link>
                            <Link
                              href="/config/configmaps"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/config/configmaps")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="ConfigMaps"
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>ConfigMaps</span>
                            </Link>
                            <Link
                              href="/config/secrets"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/config/secrets")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title="Secrets"
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>Secrets</span>
                            </Link>
                            <Link
                              href="/events"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/events")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.events")}
                            >
                              <Rss className="h-4 w-4" />
                              <span>{t("sidebar.events")}</span>
                            </Link>
                            <Link
                              href="/storage"
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                isPathActive("/storage")
                                  ? "bg-accent text-accent-foreground"
                                  : "text-text-muted hover:bg-muted hover:text-text-primary",
                              )}
                              title={t("sidebar.storage")}
                            >
                              <FolderTree className="h-4 w-4" />
                              <span>{t("sidebar.storage")}</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Link href="/clusters" className="block rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-primary">
                    {t("sidebar.noClusters")}
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Remaining sections (non cluster-scoped) */}
          {navItems.filter((n) => n.href !== "/clusters").map((item) => {
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
            aria-label={collapsed ? t("sidebar.aria.expand") : t("sidebar.aria.collapse")}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-text-muted hover:bg-muted hover:text-text-primary flex items-center justify-between"
            onClick={() => setCollapsed((v) => !v)}
          >
            {!collapsed && <span>{t("sidebar.collapse")}</span>}
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

