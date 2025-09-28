import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { queryKeys, fetchEvents } from "@/lib/api";

export function ActivityTimeline() {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: queryKeys.events,
    queryFn: fetchEvents,
  });

  const recentEvents = events?.slice(0, 4) || [];

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">Recent activity</CardTitle>
        <CardDescription>Latest changes and events across your cluster</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">Loading recent activity...</p>
          </div>
        ) : isError ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">Failed to load events.</p>
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">No recent activity recorded.</p>
          </div>
        ) : (
          recentEvents.map((event, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-accent" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">{event.reason}</p>
                  <span className={`${badgePresets.label} text-text-muted`}>
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Unknown time'}
                  </span>
                </div>
                <p className="text-xs font-mono text-text-secondary">{event.involved_object}</p>
                <p className="text-xs text-text-muted">
                  {event.message} {event.namespace && `in ${event.namespace} namespace`}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

