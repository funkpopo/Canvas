import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ResourceCardProps {
  label: string;
  value: string;
  trend?: ReactNode;
  description?: string;
}

export function ResourceCard({ label, value, trend, description }: ResourceCardProps) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-[color:var(--canvas-card-border)] bg-[linear-gradient(135deg,var(--canvas-card-gradient-from)_0%,var(--canvas-card-gradient-to)_100%)] shadow-[0_22px_60px_rgba(15,23,42,0.12)] transition-colors duration-300 dark:shadow-[0_32px_80px_rgba(2,6,23,0.55)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--canvas-card-highlight),transparent_75%)] opacity-90"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-px rounded-[calc(var(--radius-xl))] border border-white/20 mix-blend-overlay dark:border-white/5"
        aria-hidden
      />
      <CardContent className="relative z-10 flex min-h-[160px] flex-col justify-between gap-8 p-6">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.42em] text-[color:var(--canvas-muted)]">
          <span>{label}</span>
          {trend}
        </div>
        <div className="space-y-2">
          <p className="text-3xl font-semibold text-[color:var(--canvas-fg)]">{value}</p>
          {description ? (
            <p className="text-sm text-[color:var(--canvas-muted)]">{description}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
