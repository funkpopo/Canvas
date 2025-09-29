"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Rss } from "lucide-react";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { EventFeed } from "@/features/dashboard/components/event-feed";
import { useI18n } from "@/shared/i18n/i18n";
import { queryKeys, fetchEvents, type EventMessageResponse } from "@/lib/api";
// modal removed: inline filters shown above feed

function FiltersContent({
  typeOptions,
  resourceOptions,
  selectedTypes,
  selectedResources,
  toggleType,
  toggleResource,
  searchQuery,
  setSearchQuery,
  namespaceQuery,
  setNamespaceQuery,
  onClear,
  t,
}: any) {
  return (
    <>
      <div className="space-y-4">
        <div>
          <p className={`mb-2 ${badgePresets.label} text-text-muted`}>{t("events.filters.types")}</p>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map((opt: any) => {
              const active = selectedTypes.includes(opt.value);
              return (
                <Badge
                  key={opt.value}
                  variant={opt.variant}
                  size="sm"
                  role="button"
                  aria-pressed={active}
                  onClick={() => toggleType(opt.value)}
                  className={`cursor-pointer select-none ${active ? "ring-1 ring-accent" : "opacity-70 hover:opacity-100"}`}
                  title={t("events.filters.toggle", { label: opt.label })}
                >
                  {opt.label}
                </Badge>
              );
            })}
          </div>
        </div>
        <div>
          <p className={`mb-2 ${badgePresets.label} text-text-muted`}>{t("events.filters.resources")}</p>
          <div className="flex flex-wrap gap-2">
            {resourceOptions.map((r: any) => {
              const active = selectedResources.includes(r.value);
              return (
                <Badge
                  key={r.value}
                  variant="neutral-light"
                  size="sm"
                  role="button"
                  aria-pressed={active}
                  onClick={() => toggleResource(r.value)}
                  className={`cursor-pointer select-none ${active ? "ring-1 ring-accent" : "opacity-70 hover:opacity-100"}`}
                  title={t("events.filters.toggle", { label: r.label })}
                >
                  {r.label}
                </Badge>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={`mb-2 ${badgePresets.label} text-text-muted`}>{t("events.filters.search")}</p>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("events.filters.search.placeholder")}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <p className={`mb-2 ${badgePresets.label} text-text-muted`}>{t("events.filters.namespace")}</p>
            <input
              type="text"
              value={namespaceQuery}
              onChange={(e) => setNamespaceQuery(e.target.value)}
              placeholder={t("events.filters.namespace.placeholder")}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
        <div className="pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            {t("events.filters.clear")}
          </Button>
        </div>
      </div>
    </>
  );
}

export default function EventsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [namespaceQuery, setNamespaceQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const typeOptions = [
    { label: t("events.type.warning"), value: "Warning", variant: "warning-light" as const },
    { label: t("events.type.error"), value: "Error", variant: "error-light" as const },
    { label: t("events.type.normal"), value: "Normal", variant: "info-light" as const },
  ];
  const resourceOptions = [
    { label: t("events.resource.pods"), value: "pod" },
    { label: t("events.resource.services"), value: "service" },
    { label: t("events.resource.deployments"), value: "deployment" },
  ];

  const toggleType = (v: string) => {
    setSelectedTypes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };
  const toggleResource = (v: string) => {
    setSelectedResources((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const activeTypes = useMemo(() => selectedTypes, [selectedTypes]);
  const activeResources = useMemo(() => selectedResources, [selectedResources]);

  // Fetch events for header metrics
  const { data: events } = useQuery<EventMessageResponse[]>({
    queryKey: queryKeys.events,
    queryFn: fetchEvents,
    refetchInterval: 5000,
  });

  // Reuse same filtering logic as EventFeed for consistent metrics
  const filteredForHeader: EventMessageResponse[] = useMemo(() => {
    const list: EventMessageResponse[] = events ?? [];

    const tset = new Set(activeTypes.map((t) => t.toLowerCase()));
    const rset = new Set(activeResources.map((r) => r.toLowerCase()));
    const q = searchQuery.trim().toLowerCase();
    const ns = namespaceQuery.trim().toLowerCase();

    const byType = (e: EventMessageResponse) =>
      tset.size === 0 || (e.type && tset.has(String(e.type).toLowerCase()));

    const byResource = (e: EventMessageResponse) => {
      if (rset.size === 0) return true;
      const io = (e.involved_object ?? "").toLowerCase();
      const kind = io.split("/")[0];
      return rset.has(kind) || Array.from(rset).some((r) => io.includes(r));
    };

    const bySearch = (e: EventMessageResponse) => {
      if (!q) return true;
      const reason = (e.reason ?? "").toLowerCase();
      const message = (e.message ?? "").toLowerCase();
      const io = (e.involved_object ?? "").toLowerCase();
      const type = (e.type ?? "").toLowerCase();
      return (
        reason.includes(q) || message.includes(q) || io.includes(q) || type.includes(q)
      );
    };

    const byNamespace = (e: EventMessageResponse) => {
      if (!ns) return true;
      const nsv = (e.namespace ?? "").toLowerCase();
      return nsv.includes(ns);
    };

    return list.filter((e) => byType(e) && byResource(e) && bySearch(e) && byNamespace(e));
  }, [events, activeTypes, activeResources, searchQuery, namespaceQuery]);

  // Compute 5-minute window metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    const cutoff = now - windowMs;
    const inWindow = filteredForHeader.filter((e) => {
      const ts = e?.timestamp ? new Date(e.timestamp).getTime() : NaN;
      return Number.isFinite(ts) && ts >= cutoff;
    });
    const perMinute = Math.round(inWindow.length / 5);
    const warnings = inWindow.filter((e) => String(e.type || "").toLowerCase() === "warning").length;
    return { perMinute, warnings };
  }, [filteredForHeader]);

  // Initialize from URL on mount
  useEffect(() => {
    const typesParam = searchParams.get("types");
    const resourcesParam = searchParams.get("resources");
    const qParam = searchParams.get("q");
    const nsParam = searchParams.get("ns");
    if (typesParam) setSelectedTypes(typesParam.split(",").filter(Boolean));
    if (resourcesParam) setSelectedResources(resourcesParam.split(",").filter(Boolean));
    if (qParam) setSearchQuery(qParam);
    if (nsParam) setNamespaceQuery(nsParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync to URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
    if (selectedResources.length > 0) params.set("resources", selectedResources.join(","));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (namespaceQuery.trim()) params.set("ns", namespaceQuery.trim());

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [selectedTypes, selectedResources, searchQuery, namespaceQuery, pathname, router]);

  const clearAll = () => {
    setSelectedTypes([]);
    setSelectedResources([]);
    setSearchQuery("");
    setNamespaceQuery("");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("events.eyebrow")}
        title={t("events.title")}
        description={t("events.desc")}
        actions={
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => setFiltersOpen((v) => !v)}>
              <Filter className="h-4 w-4" aria-hidden />
              {t("events.actions.filters")}
            </Button>
            <Button type="button" variant="default">
              <Rss className="h-4 w-4" aria-hidden />
              {t("events.actions.subscribe")}
            </Button>
          </div>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("events.meta.rate")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{metrics.perMinute}</p>
              <p className="text-xs text-text-muted">{t("events.meta.rate.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("events.meta.warning")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{metrics.warnings}</p>
              <p className="text-xs text-text-muted">{t("events.meta.warning.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("events.meta.rtt")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">1.24s</p>
              <p className="text-xs text-text-muted">{t("events.meta.rtt.help")}</p>
            </div>
          </>
        }
      />

      <div className="space-y-6">
        {filtersOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-text-primary">{t("events.filters.title")}</CardTitle>
              <CardDescription>{t("events.filters.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FiltersContent
                typeOptions={typeOptions}
                resourceOptions={resourceOptions}
                selectedTypes={selectedTypes}
                selectedResources={selectedResources}
                toggleType={toggleType}
                toggleResource={toggleResource}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                namespaceQuery={namespaceQuery}
                setNamespaceQuery={setNamespaceQuery}
                onClear={clearAll}
                t={t}
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={clearAll}>{t("events.filters.clear")}</Button>
                <Button onClick={() => setFiltersOpen(false)}>{t("actions.save")}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <EventFeed
          types={activeTypes}
          resources={activeResources}
          search={searchQuery}
          namespace={namespaceQuery}
        />
      </div>
    </div>
  );
}


