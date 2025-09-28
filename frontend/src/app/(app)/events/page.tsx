import { Filter, Rss } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventFeed } from "@/components/dashboard/event-feed";

export default function EventsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Event stream"
        title="Observe signals in real time"
        description="Filter high-volume Kubernetes events into actionable intelligence aligned with your runbooks."
        actions={
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" className="border-white/20 bg-white/5 text-slate-200">
              <Filter className="h-4 w-4" aria-hidden />
              Advanced filters
            </Button>
            <Button type="button" className="bg-gradient-to-r from-rose-400 to-orange-400 text-slate-900 hover:from-rose-300 hover:to-orange-300">
              <Rss className="h-4 w-4" aria-hidden />
              Subscribe stream
            </Button>
          </div>
        }
        meta={
          <>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Events/min</p>
              <p className="mt-1 text-lg font-semibold text-white">142</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Smoothed over the last 5 minutes.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Noise reduction</p>
              <p className="mt-1 text-lg font-semibold text-white">63%</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Suppressed via enrichment rules.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Escalations</p>
              <p className="mt-1 text-lg font-semibold text-white">2</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Forwarded to PagerDuty in past hour.</p>
            </div>
          </>
        }
      >
        <Badge variant="outline" className="border-violet-400/40 bg-violet-500/10 text-violet-100">
          Noise reduction powered by stream queries
        </Badge>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <EventFeed />
        <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
          <CardHeader>
            <CardTitle className="text-white">Upcoming enhancements</CardTitle>
            <CardDescription>
              Layer on correlation with metrics, traces, and incident timelines.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[color:var(--canvas-muted)]">
            <p>Stream high-severity events directly into command center automations.</p>
            <p>Retain event history for 30 days with full text search and export.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}