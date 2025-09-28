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
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-[linear-gradient(135deg,rgba(14,165,233,0.18)_0%,rgba(14,116,144,0.18)_40%,rgba(15,23,42,0.85)_100%)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--canvas-border)/35,transparent_70%)]"
        aria-hidden
      />
      <CardContent className="relative z-10 flex min-h-[150px] flex-col justify-between p-6">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-[color:var(--canvas-muted)]">
          <span>{label}</span>
          {trend}
        </div>
        <div>
          <p className="text-3xl font-semibold text-white">{value}</p>
          {description ? <p className="mt-1 text-sm text-[color:var(--canvas-muted)]">{description}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}