"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  FolderPen,
  Activity,
  Settings2,
  Database,
  Lock,
  Shield,
  Cpu,
  AlertCircle,
  Bell,
  Wifi,
  WifiOff,
  AlertTriangle,
  Loader2,
  LogOut,
  User as UserIcon,
  Globe,
  Timer,
  Layers,
  Network,
  HardDrive,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { useTranslations } from "@/hooks/use-translations";
import ClusterSelector from "@/components/ClusterSelector";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "overview",
    items: [
      { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "cluster",
    items: [
      { href: "/clusters", labelKey: "clusters", icon: Server },
      { href: "/nodes", labelKey: "nodes", icon: Server },
      { href: "/namespaces", labelKey: "namespaces", icon: FolderPen },
      { href: "/events", labelKey: "events", icon: AlertCircle },
    ],
  },
  {
    labelKey: "workloads",
    items: [
      { href: "/pods", labelKey: "pods", icon: Activity },
      { href: "/deployments", labelKey: "deployments", icon: Layers },
      { href: "/statefulsets", labelKey: "statefulsets", icon: Database },
      { href: "/daemonsets", labelKey: "daemonsets", icon: Server },
      { href: "/jobs", labelKey: "jobs", icon: Settings2 },
      { href: "/cronjobs", labelKey: "cronjobs", icon: Timer },
      { href: "/hpas", labelKey: "hpas", icon: Cpu },
    ],
  },
  {
    labelKey: "networking",
    items: [
      { href: "/services", labelKey: "services", icon: Settings2 },
      { href: "/ingress", labelKey: "ingress", icon: Globe },
      { href: "/network-policies", labelKey: "networkPolicies", icon: Network },
    ],
  },
  {
    labelKey: "configuration",
    items: [
      { href: "/configmaps", labelKey: "configmaps", icon: Database },
      { href: "/secrets", labelKey: "secrets", icon: Lock },
      { href: "/resource-quotas", labelKey: "resourceQuotas", icon: Cpu },
    ],
  },
  {
    labelKey: "storageGroup",
    items: [
      { href: "/storage", labelKey: "storage", icon: HardDrive },
    ],
  },
  {
    labelKey: "administration",
    items: [
      { href: "/users", labelKey: "users", icon: UserIcon },
      { href: "/rbac", labelKey: "rbac", icon: Shield },
      { href: "/audit-logs", labelKey: "auditLogs", icon: Activity },
      { href: "/alerts", labelKey: "alerts", icon: Bell },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const { logout } = useAuth();
  const { wsConnected, wsConnecting, wsPolling, wsError } = useCluster();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="bg-foreground text-background flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Server className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Canvas</span>
                  <span className="truncate text-xs text-muted-foreground">Kubernetes Console</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={t(item.labelKey)}
                    >
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <div className="px-2 py-1">
          <ClusterSelector />
        </div>
        <SidebarSeparator />
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-1">
            {wsConnected ? (
              <Wifi className="h-3.5 w-3.5 text-green-500" />
            ) : wsConnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />
            ) : wsPolling ? (
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            ) : wsError ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {wsConnected ? tCommon("connected") : wsConnecting ? tCommon("connecting") : tCommon("disconnected")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("userCenter")}>
              <Link href="/user-center">
                <UserIcon className="size-4" />
                <span>{t("userCenter")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip={tCommon("logout")}>
              <LogOut className="size-4" />
              <span>{tCommon("logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
