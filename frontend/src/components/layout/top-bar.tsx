"use client";

import Link from "next/link";
import { BellIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { queryKeys, fetchClusterConfig } from "@/lib/api";

export function TopBar() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  const clusterName = data?.name ?? "未配置";
  const apiServer = data?.api_server ?? "未设置 API 地址";

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--canvas-border)] bg-black/10 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Active cluster</p>
          <span className="text-lg font-semibold text-white">
            {isLoading ? "加载中…" : clusterName}
          </span>
          <p className="text-xs text-[color:var(--canvas-muted)]">
            {isError ? "无法获取集群信息" : apiServer}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="border-white/20 bg-white/5 text-xs uppercase tracking-[0.3em] text-slate-200">
          <Link href="/settings">配置集群</Link>
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 rounded-full border border-[var(--canvas-border)] bg-black/20 px-4 py-2 text-sm text-slate-200">
          <MagnifyingGlassIcon className="h-4 w-4" aria-hidden />
          <input
            className="w-48 bg-transparent text-sm text-white placeholder:text-[color:var(--canvas-muted)] focus:outline-none"
            placeholder="Search resources"
            type="search"
            disabled
          />
        </label>
        <button
          type="button"
          className="rounded-full border border-[var(--canvas-border)] bg-black/20 p-2 text-slate-200 transition hover:bg-white/10"
          aria-label="Notifications"
        >
          <BellIcon className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-[var(--canvas-border)] bg-black/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-haspopup="menu"
          aria-expanded="false"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-sm font-semibold text-black">
            OP
          </span>
          <DotsHorizontalIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}
