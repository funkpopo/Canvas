import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  children,
  className,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-[color:var(--canvas-border)] bg-[linear-gradient(140deg,var(--canvas-card-gradient-from)_0%,var(--canvas-card-gradient-to)_100%)] px-8 py-10 shadow-[0_24px_65px_rgba(15,23,42,0.14)] transition-colors duration-300 dark:shadow-[0_28px_90px_rgba(2,6,23,0.6)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-[-8%] top-[12%] h-60 w-60 rounded-full bg-[radial-gradient(circle,var(--canvas-card-highlight),transparent_75%)] blur-3xl"
          aria-hidden
        />
        <div
          className="absolute bottom-[-25%] right-[-10%] h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--canvas-overlay-soft),transparent_70%)] blur-[140px]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.28),transparent_65%)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.4)_0%,transparent_40%,transparent_70%,rgba(59,7,100,0.25)_100%)] dark:bg-[linear-gradient(160deg,rgba(15,23,42,0.4)_0%,transparent_40%,transparent_70%,rgba(59,7,100,0.35)_100%)]"
          aria-hidden
        />
      </div>
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          {eyebrow ? (
            <span className="text-xs uppercase tracking-[0.35em] text-[color:var(--canvas-muted)]">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="text-3xl font-semibold text-[color:var(--canvas-fg)] lg:text-4xl">{title}</h1>
          <p className="mt-3 text-base text-[color:var(--canvas-muted)]">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {meta ? (
        <div className="relative z-10 mt-8 grid gap-4 text-sm text-[color:var(--canvas-muted)] md:grid-cols-3">
          {meta}
        </div>
      ) : null}
      {children ? <div className="relative z-10 mt-6">{children}</div> : null}
    </section>
  );
}

