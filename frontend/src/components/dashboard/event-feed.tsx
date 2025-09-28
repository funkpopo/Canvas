import { Activity, AlertTriangle, Info, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchEvents, queryKeys } from "@/lib/api";

const badgePalette: Record<string, { icon: LucideIcon; className: string }> = {
  Warning: {
    icon: AlertTriangle,
    className: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  },
  Normal: {
    icon: Activity,
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
  },
  Deployment: {
    icon: Rocket,
    className: "border-sky-500/40 bg-sky-500/15 text-sky-100",
  },
  default: {
    icon: Info,
    className: "border-white/20 bg-white/10 text-slate-200",
  },
};

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 0) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function EventFeed() {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: queryKeys.events,
    queryFn: fetchEvents,
    refetchInterval: 10000,
  });

  return (
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-[var(--canvas-panel)]/80">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_65%)]"
        aria-hidden
      />
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg text-white">Live events</CardTitle>
        <CardDescription>Server-side events captured from the Kubernetes API.</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 grid gap-3">
        {isLoading ? (
          <p className="text-sm text-[color:var(--canvas-muted)]">Loading events…</p>
        ) : isError ? (
          <p className="text-sm text-rose-200">Failed to stream events from the cluster.</p>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-[color:var(--canvas-muted)]">No recent events reported.</p>
        ) : (
          events.slice(0, 6).map((event, index) => {
            const style = badgePalette[event.type] ?? badgePalette.default;
            const Icon = style.icon;
            return (
              <article
                key={`${event.involved_object}-${event.timestamp}-${index}`}
                className="rounded-xl border border-white/5 bg-white/5 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.45)] transition hover:border-white/10 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                      <Icon className="h-5 w-5 text-slate-100" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{event.involved_object}</p>
                      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--canvas-muted)]">
                        {relativeTime(event.timestamp)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={style.className}>
                    {event.type}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-200">{event.message}</p>
                <p className="mt-1 text-xs text-[color:var(--canvas-muted)]">{event.reason} • {event.namespace ?? "cluster-wide"}</p>
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
