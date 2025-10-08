"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ackAlert, fetchActiveAlerts, queryKeys, silenceAlert, type AlertEntryResponse } from "@/lib/api";
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

export default function ActiveAlertsPage() {
  const qc = useQueryClient();
  const { data: alerts } = useQuery({ 
    queryKey: queryKeys.activeAlerts(), 
    queryFn: fetchActiveAlerts,
    refetchInterval: 15_000 
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  async function onAck(fp?: string | null) {
    if (!fp) return;
    await ackAlert(fp);
    qc.invalidateQueries({ queryKey: ["alerts", "active"] });
  }

  async function onSilence(fp?: string | null) {
    if (!fp) return;
    await silenceAlert(fp, 60);
    qc.invalidateQueries({ queryKey: ["alerts", "active"] });
  }

  function toggleRow(idx: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  const firingCount = (alerts ?? []).filter((a) => a.status === "firing").length;
  const resolvedCount = (alerts ?? []).filter((a) => a.status === "resolved").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Active Alerts"
        description="Latest alert per fingerprint (deduplicated)"
        meta={
          <>
            <div>
              <p className="text-xs text-text-muted">Firing</p>
              <p className="mt-1 text-lg font-semibold text-red-400">{firingCount}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Resolved</p>
              <p className="mt-1 text-lg font-semibold text-green-400">{resolvedCount}</p>
            </div>
          </>
        }
      />

      <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-text-muted">
            <tr>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Alert</th>
              <th className="px-4 py-2 text-left">Severity</th>
              <th className="px-4 py-2 text-left">Received</th>
              <th className="px-4 py-2 text-left">State</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(alerts ?? []).map((a, idx) => {
              const isExpanded = expandedRows.has(idx);
              const severity = a.labels?.severity || "info";
              const isSilenced = a.silenced_until && new Date(a.silenced_until) > new Date();
              return (
                <>
                  <tr 
                    key={idx} 
                    className="border-t border-[var(--canvas-border)] hover:bg-black/20 cursor-pointer"
                    onClick={() => toggleRow(idx)}
                  >
                    <td className="px-4 py-2">
                      <Badge variant={a.status === "firing" ? "destructive" : "success-light"} size="sm">
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--canvas-text-muted)]">{isExpanded ? "▼" : "▶"}</span>
                        <span className="font-medium">{a.labels?.alertname || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge 
                        variant={
                          severity === "critical" ? "destructive" : 
                          severity === "warning" ? "warning" : 
                          "neutral-light"
                        } 
                        size="sm"
                      >
                        {severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-[var(--canvas-text-muted)]">
                      {formatTs(a.received_at)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        {a.acked && (
                          <Badge variant="neutral-light" size="sm">Acknowledged</Badge>
                        )}
                        {isSilenced && (
                          <Badge variant="warning" size="sm">Silenced</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {!a.acked && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => onAck(a.fingerprint || "")} 
                            disabled={!a.fingerprint}
                          >
                            Ack
                          </Button>
                        )}
                        {!isSilenced && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => onSilence(a.fingerprint || "")} 
                            disabled={!a.fingerprint}
                          >
                            Silence 1h
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${idx}-detail`} className="border-t border-[var(--canvas-border)] bg-black/10">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-3 text-sm">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <h4 className="font-semibold text-[var(--canvas-text-primary)] mb-1">Labels:</h4>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(a.labels || {}).map(([lk, lv]) => (
                                  <Badge key={lk} variant="neutral-light" size="sm">{lk}: {lv}</Badge>
                                ))}
                              </div>
                            </div>
                            {a.annotations && Object.keys(a.annotations).length > 0 && (
                              <div>
                                <h4 className="font-semibold text-[var(--canvas-text-primary)] mb-1">Annotations:</h4>
                                <div className="space-y-1">
                                  {Object.entries(a.annotations).map(([ak, av]) => (
                                    <div key={ak} className="text-[var(--canvas-text-muted)]">
                                      <span className="font-medium text-[var(--canvas-text-primary)]">{ak}:</span> {String(av)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <h4 className="font-semibold text-[var(--canvas-text-primary)] mb-1">Timeline:</h4>
                              <div className="space-y-1 text-[var(--canvas-text-muted)]">
                                <div>Started: {formatTs(a.starts_at) || "N/A"}</div>
                                {a.ends_at && <div>Ended: {formatTs(a.ends_at)}</div>}
                                <div>Received: {formatTs(a.received_at)}</div>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold text-[var(--canvas-text-primary)] mb-1">Metadata:</h4>
                              <div className="space-y-1">
                                {a.fingerprint && (
                                  <div>
                                    <span className="text-[var(--canvas-text-muted)] text-xs">Fingerprint:</span>
                                    <code className="text-xs text-[var(--canvas-text-muted)] bg-black/20 px-2 py-1 rounded block mt-1">{a.fingerprint}</code>
                                  </div>
                                )}
                                {a.generator_url && (
                                  <div>
                                    <span className="text-[var(--canvas-text-muted)] text-xs">Generator:</span>
                                    <a href={a.generator_url} target="_blank" rel="noopener noreferrer" className="text-[var(--canvas-primary)] hover:underline text-xs block mt-1">
                                      {a.generator_url.length > 60 ? a.generator_url.slice(0, 60) + "..." : a.generator_url}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
