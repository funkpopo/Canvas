import { Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchEvents, queryKeys } from "@/lib/api";

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }
  return date.toLocaleTimeString();
}

export function ActivityTimeline() {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: queryKeys.events,
    queryFn: fetchEvents,
    refetchInterval: 10000,
  });

  const timeline = events?.slice(0, 8) ?? [];

  return (
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-[var(--canvas-panel)]/80">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.12),transparent_65%)]"
        aria-hidden
      />
      <CardHeader className="relative z-10">
        <CardTitle className="flex items-center gap-2 text-lg text-white">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
            <Activity className="h-4 w-4 text-emerald-200" aria-hidden />
          </span>
          Operator timeline
        </CardTitle>
        <CardDescription>Recent events grouped chronologically.</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <ScrollArea className="h-[320px] pr-4">
          {isLoading ? (
            <p className="text-sm text-[color:var(--canvas-muted)]">Loading activity…</p>
          ) : isError ? (
            <p className="text-sm text-rose-200">Unable to load activity timeline.</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-[color:var(--canvas-muted)]">No activity recorded for this cluster.</p>
          ) : (
            <ul className="relative grid gap-6">
              <div
                className="pointer-events-none absolute left-[19px] top-0 h-full w-px bg-gradient-to-b from-emerald-500/60 via-emerald-500/20 to-transparent"
                aria-hidden
              />
              {timeline.map((item, index) => (
                <li key={`${item.involved_object}-${item.timestamp}-${index}`} className="relative pl-12">
                  <div className="absolute left-0 top-1 flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10">
                    <span className="text-xs font-semibold text-emerald-100">{index + 1}</span>
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{item.reason} — {item.involved_object}</p>
                      <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
                        {item.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-200">{item.message}</p>
                    <span className="text-xs uppercase tracking-[0.25em] text-[color:var(--canvas-muted)]">
                      {formatTimestamp(item.timestamp)} • {item.namespace ?? "cluster-wide"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
