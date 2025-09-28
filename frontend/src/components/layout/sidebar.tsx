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
    <aside className="flex h-full w-64 flex-col gap-6 border-r border-[var(--canvas-border)] bg-black/5 px-4 py-6 backdrop-blur-xl">
      <div>
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          Canvas
        </Link>
        <p className="mt-3 text-xs text-[color:var(--canvas-muted)]">
          Kubernetes health & workload intelligence
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-2 text-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                isActive
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
