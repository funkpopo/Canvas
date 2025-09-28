import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { queryKeys, fetchEvents } from "@/lib/api";

const typeVariants = {
  Normal: "info-light" as const,
  Warning: "warning-light" as const,
  Error: "error-light" as const,
};

export function EventFeed() {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: queryKeys.events,
    queryFn: fetchEvents,
    refetchInterval: 5000,
  });

  const recentEvents = events?.slice(0, 10) || [];

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">Live events</CardTitle>
        <CardDescription>Real-time cluster events as they happen</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <p className="text-sm text-text-muted">Loading events…</p>
          ) : isError ? (
            <p className="text-sm text-text-muted">Unable to load events.</p>
          ) : recentEvents.length === 0 ? (
            <p className="text-sm text-text-muted">No recent events reported.</p>
          ) : (
            <div className="space-y-4">
              {recentEvents.map((event, index) => (
                <div
                  key={`${event.involved_object}-${event.timestamp}-${index}`}
                  className="rounded-xl border border-border bg-muted/30 p-4 transition hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={typeVariants[event.type as keyof typeof typeVariants] || "neutral-light"} 
                          size="sm"
                        >
                          {event.type}
                        </Badge>
                        <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                          {event.involved_object}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-text-primary">{event.reason}</p>
                      <p className="text-xs text-text-muted">{event.message}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-text-muted">
                        {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Unknown time'}
                      </p>
                      <Badge variant="outline" size="sm" className="mt-1">
                        {event.namespace}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

