import { useMemo } from "react";
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
import { useI18n } from "@/shared/i18n/i18n";

const typeVariants = {
  Normal: "info-light" as const,
  Warning: "warning-light" as const,
  Error: "error-light" as const,
};

export interface EventFeedFilters {
  types?: string[];
  resources?: string[];
  search?: string;
  namespace?: string;
}

export function EventFeed({ types = [], resources = [], search = "", namespace = "" }: EventFeedFilters) {
  const { t } = useI18n();
  const { data: events, isLoading, isError } = useQuery({
    queryKey: queryKeys.events,
    queryFn: fetchEvents,
    refetchInterval: 5000,
  });

  const filtered = useMemo(() => {
    if (!events) return [] as typeof events;

    const tset = new Set(types.map((t) => t.toLowerCase()));
    const rset = new Set(resources.map((r) => r.toLowerCase()));
    const q = search.trim().toLowerCase();
    const ns = namespace.trim().toLowerCase();

    const byType = (e: NonNullable<typeof events>[number]) =>
      tset.size === 0 || (e.type && tset.has(String(e.type).toLowerCase()));

    const byResource = (e: NonNullable<typeof events>[number]) => {
      if (rset.size === 0) return true;
      const io = (e.involved_object ?? "").toLowerCase();
      const kind = io.split("/")[0];
      return rset.has(kind) || Array.from(rset).some((r) => io.includes(r));
    };

    const bySearch = (e: NonNullable<typeof events>[number]) => {
      if (!q) return true;
      const reason = (e.reason ?? "").toLowerCase();
      const message = (e.message ?? "").toLowerCase();
      const io = (e.involved_object ?? "").toLowerCase();
      const type = (e.type ?? "").toLowerCase();
      return (
        reason.includes(q) ||
        message.includes(q) ||
        io.includes(q) ||
        type.includes(q)
      );
    };

    const byNamespace = (e: NonNullable<typeof events>[number]) => {
      if (!ns) return true;
      const nsv = (e.namespace ?? "").toLowerCase();
      return nsv.includes(ns);
    };

    return events.filter((e) => byType(e) && byResource(e) && bySearch(e) && byNamespace(e));
  }, [events, types, resources, search, namespace]);

  const recentEvents = filtered.slice(0, 20);

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">{t("events.live.title")}</CardTitle>
        <CardDescription>{t("events.live.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <ScrollArea className="pr-4 max-h-[calc(100vh-280px)] md:max-h-[calc(100vh-260px)] lg:max-h-[calc(100vh-240px)]">
          {isLoading ? (
            <p className="text-sm text-text-muted">{t("events.live.loading")}</p>
          ) : isError ? (
            <p className="text-sm text-text-muted">{t("events.live.error")}</p>
          ) : recentEvents.length === 0 ? (
            <p className="text-sm text-text-muted">{t("events.live.empty")}</p>
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
                        {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : t("events.live.unknownTime")}
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

