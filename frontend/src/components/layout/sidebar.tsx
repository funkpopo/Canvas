"use client";

import {
  ChartPieIcon,
  Cog6ToothIcon,
  QueueListIcon,
  RectangleStackIcon,
  ServerStackIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: SignalIcon },
  { href: "/workloads", label: "Workloads", icon: RectangleStackIcon },
  { href: "/nodes", label: "Nodes", icon: ServerStackIcon },
  { href: "/namespaces", label: "Namespaces", icon: QueueListIcon },
  { href: "/events", label: "Events", icon: ChartPieIcon },
  { href: "/settings", label: "Settings", icon: Cog6ToothIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col gap-6 border-r border-[color:var(--canvas-border)] bg-[color:var(--canvas-sidebar-bg)] px-4 py-6 backdrop-blur-xl transition-colors duration-300">
      <div>
        <Link
          href="/"
          className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--canvas-fg)]"
        >
          Canvas
        </Link>
        <p className="mt-3 text-xs leading-5 text-[color:var(--canvas-muted)]">
          Kubernetes health & workload intelligence
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-2 text-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--canvas-control-border)]",
                isActive
                  ? "bg-[color:var(--canvas-control-surface-strong)] text-[color:var(--canvas-fg)] shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:shadow-[0_16px_40px_rgba(2,6,23,0.45)]"
                  : "text-[color:var(--canvas-muted)] hover:bg-[color:var(--canvas-control-surface)] hover:text-[color:var(--canvas-fg)]",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-[color:var(--canvas-fg)]" : "text-[color:var(--canvas-muted)] group-hover:text-[color:var(--canvas-fg)]",
                )}
                aria-hidden
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
