"use client";

import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "切换到日间主题" : "切换到夜间主题"}
      className={cn(
        "group flex items-center gap-2 rounded-full border border-[color:var(--canvas-control-border)] bg-[color:var(--canvas-control-surface)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--canvas-fg)] transition-colors hover:bg-[color:var(--canvas-control-surface-strong)]",
        className,
      )}
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Sun
          className={cn(
            "absolute h-4 w-4 transition-all duration-300 ease-out",
            isDark ? "scale-75 opacity-0 rotate-45" : "scale-100 opacity-100 rotate-0",
          )}
          aria-hidden
        />
        <Moon
          className={cn(
            "absolute h-4 w-4 transition-all duration-300 ease-out",
            isDark ? "scale-100 opacity-100 rotate-0" : "scale-75 opacity-0 -rotate-45",
          )}
          aria-hidden
        />
      </span>
      <span className="hidden text-[10px] font-medium tracking-[0.4em] text-[color:var(--canvas-muted)] md:inline">
        {isDark ? "Night" : "Day"}
      </span>
    </button>
  );
}
