import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-[color:var(--canvas-bg)] text-[color:var(--canvas-fg)] transition-colors duration-300">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[-18%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.25),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(16,185,129,0.2),transparent_72%)]"
          aria-hidden
        />
        <div
          className="absolute left-[8%] top-[42%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.18),transparent_70%)] blur-[140px] dark:bg-[radial-gradient(circle,rgba(56,189,248,0.16),transparent_70%)]"
          aria-hidden
        />
        <div
          className="absolute bottom-[-12%] right-[4%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(129,140,248,0.16),transparent_70%)] blur-[140px] dark:bg-[radial-gradient(circle,rgba(217,70,239,0.15),transparent_70%)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--canvas-overlay-soft),transparent_70%)]"
          aria-hidden
        />
      </div>
      <Sidebar />
      <div className="relative flex min-h-screen flex-1 flex-col">
        <TopBar />
        <main className="relative flex flex-1 flex-col overflow-y-auto px-6 py-6">
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(148,163,184,0.12)_0%,transparent_38%,transparent_65%,rgba(99,102,241,0.16)_100%)] dark:bg-[linear-gradient(120deg,rgba(148,163,184,0.08)_0%,transparent_38%,transparent_65%,rgba(99,102,241,0.12)_100%)]"
            aria-hidden
          />
          <div className="relative z-10 flex flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
