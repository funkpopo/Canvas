"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Server,
  Folder,
  Layers,
  Activity,
  Settings,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { badgePresets } from "@/shared/ui/badge";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Nodes", href: "/nodes", icon: Server },
  { name: "Namespaces", href: "/namespaces", icon: Folder },
  { name: "Workloads", href: "/workloads", icon: Layers },
  { name: "Events", href: "/events", icon: Activity },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-surface">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center px-6">
          <Link
            href="/"
            className={`flex items-center gap-3 text-sm font-semibold ${badgePresets.tag} text-text-primary`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            Canvas
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-text-muted hover:bg-muted hover:text-text-primary"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

