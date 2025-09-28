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

export default function EventsPage() {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);

  const typeOptions = [
    { label: "Warning", value: "Warning", variant: "warning-light" as const },
    { label: "Error", value: "Error", variant: "error-light" as const },
    { label: "Normal", value: "Normal", variant: "info-light" as const },
  ];
  const resourceOptions = [
    { label: "Pods", value: "pod" },
    { label: "Services", value: "service" },
    { label: "Deployments", value: "deployment" },
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
        eyebrow="Event stream"
        title="Observe signals in real time"
        description="Filter high-volume Kubernetes events into actionable intelligence aligned with your runbooks."
        actions={
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline">
              <Filter className="h-4 w-4" aria-hidden />
              Advanced filters
            </Button>
            <Button type="button" variant="default">
              <Rss className="h-4 w-4" aria-hidden />
              Subscribe stream
            </Button>
          </div>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Events/min</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">142</p>
              <p className="text-xs text-text-muted">Smoothed over the last 5 minutes.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Warning events</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">23</p>
              <p className="text-xs text-text-muted">Elevated conditions requiring review.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Response time</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">1.24s</p>
              <p className="text-xs text-text-muted">Average event processing delay.</p>
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
              <CardTitle className="text-lg text-text-primary">Event filters</CardTitle>
              <CardDescription>Apply filters to reduce noise and focus on critical events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className={`mb-2 ${badgePresets.label} text-text-muted`}>Event types</p>
                <div className="flex flex-wrap gap-2">
                  {typeOptions.map((t) => {
                    const active = selectedTypes.includes(t.value);
                    return (
                      <Badge
                        key={t.value}
                        variant={t.variant}
                        size="sm"
                        role="button"
                        aria-pressed={active}
                        onClick={() => toggleType(t.value)}
                        className={`cursor-pointer select-none ${active ? "ring-1 ring-accent" : "opacity-70 hover:opacity-100"}`}
                        title={`Toggle ${t.label}`}
                      >
                        {t.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className={`mb-2 ${badgePresets.label} text-text-muted`}>Resources</p>
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
                        title={`Toggle ${r.label}`}
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


