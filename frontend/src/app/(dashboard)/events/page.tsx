"use client";

import { useMemo, useState } from "react";
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

export default function EventsPage() {
  const { t } = useI18n();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("events.eyebrow")}
        title={t("events.title")}
        description={t("events.desc")}
        actions={
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline">
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
              <p className="mt-1 text-lg font-semibold text-text-primary">142</p>
              <p className="text-xs text-text-muted">{t("events.meta.rate.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("events.meta.warning")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">23</p>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EventFeed types={activeTypes} resources={activeResources} />
        </div>
        <div>
          <Card>
              <CardHeader>
              <CardTitle className="text-lg text-text-primary">{t("events.filters.title")}</CardTitle>
              <CardDescription>{t("events.filters.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                <p className={`mb-2 ${badgePresets.label} text-text-muted`}>{t("events.filters.types")}</p>
                  <div className="flex flex-wrap gap-2">
                  {typeOptions.map((opt) => {
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
                  {resourceOptions.map((r) => {
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}


