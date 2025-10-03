"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ackAlert, fetchAlertTrends, fetchAlerts, queryKeys, silenceAlert, type AlertEntryResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";

function formatTs(ts?: string | null) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data: alerts } = useQuery({ queryKey: queryKeys.alerts, queryFn: () => fetchAlerts(200), refetchInterval: 15_000 });
  const { data: trends } = useQuery({ queryKey: queryKeys.alertTrends("1h"), queryFn: () => fetchAlertTrends("1h") });
  const [groupBy, setGroupBy] = useState<"none" | "severity" | "alertname">("severity");

  const grouped = useMemo(() => {
    if (!alerts) return {} as Record<string, AlertEntryResponse[]>;
    const key = (a: AlertEntryResponse) => {
      if (groupBy === "severity") return a.labels?.severity || "none";
      if (groupBy === "alertname") return a.labels?.alertname || "unknown";
      return "all";
    };
    return alerts.reduce((acc, a) => {
      const k = key(a);
      (acc[k] ||= []).push(a);
      return acc;
    }, {} as Record<string, AlertEntryResponse[]>);
  }, [alerts, groupBy]);

  async function onAck(fp?: string | null) {
    if (!fp) return;
    await ackAlert(fp);
    qc.invalidateQueries({ queryKey: queryKeys.alerts });
  }
  async function onSilence(fp?: string | null) {
    if (!fp) return;
    await silenceAlert(fp, 60);
    qc.invalidateQueries({ queryKey: queryKeys.alerts });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        description="Recent alerts from Alertmanager webhook"
        actions={<div className="flex items-center gap-2">
          <Button variant={groupBy === "severity" ? "default" : "outline"} onClick={() => setGroupBy("severity")}>Group: Severity</Button>
          <Button variant={groupBy === "alertname" ? "default" : "outline"} onClick={() => setGroupBy("alertname")}>Group: Name</Button>
          <Button variant={groupBy === "none" ? "default" : "outline"} onClick={() => setGroupBy("none")}>Ungroup</Button>
        </div>}
        meta={<>
          <div>
            <p className="text-xs text-text-muted">Firing (1h)</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{trends?.at(-1)?.firing ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Resolved (1h)</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{trends?.at(-1)?.resolved ?? 0}</p>
          </div>
        </>}
      >
      </PageHeader>

      {Object.entries(grouped).map(([k, items]) => (
        <div key={k} className="space-y-3">
          {groupBy !== "none" ? (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{k}</h2>
              <Badge variant="neutral-light" size="sm">{items.length}</Badge>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
            <table className="w-full text-sm">
              <thead className="bg-black/40 text-text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Alert</th>
                  <th className="px-4 py-2 text-left">Labels</th>
                  <th className="px-4 py-2 text-left">Starts</th>
                  <th className="px-4 py-2 text-left">Ends</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a, idx) => (
                  <tr key={idx} className="border-t border-[var(--canvas-border)]">
                    <td className="px-4 py-2">
                      <Badge variant={a.status === "firing" ? "destructive" : "success-light"} size="sm">{a.status}</Badge>
                    </td>
                    <td className="px-4 py-2">{a.labels?.alertname || ""}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(a.labels || {}).map(([lk, lv]) => (
                          <Badge key={lk} variant="neutral-light" size="sm">{lk}:{lv}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">{formatTs(a.starts_at)}</td>
                    <td className="px-4 py-2">{formatTs(a.ends_at)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => onAck(a.fingerprint || "")} disabled={!a.fingerprint}>Ack</Button>
                        <Button size="sm" variant="outline" onClick={() => onSilence(a.fingerprint || "")} disabled={!a.fingerprint}>Silence 60m</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

