"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";
import { fetchNamespaces, fetchPodsSummary, queryKeys, type NamespaceSummaryResponse, type PodSummaryResponse } from "@/lib/api";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function PodsPage() {
  const { t } = useI18n();
  const namespaces = useNamespaces();

  const [ns, setNs] = useState<string>("all");
  const [name, setName] = useState<string>("");
  const [phase, setPhase] = useState<string>("");
  const [restartPolicy, setRestartPolicy] = useState<string>("");

  useEffect(() => {
    if (ns === "all" && namespaces.length > 0) return; // keep all by default
  }, [namespaces, ns]);

  const { data, isLoading } = useQuery<PodSummaryResponse[]>({
    queryKey: queryKeys.podsSummary(ns, name, phase, restartPolicy),
    queryFn: () => fetchPodsSummary({ namespace: ns === "all" ? undefined : ns, name, phase, restart_policy: restartPolicy }),
  });

  const pods = data ?? [];

  const phases = ["", "Running", "Pending", "Succeeded", "Failed", "Unknown"];
  const restartPolicies = ["", "Always", "OnFailure", "Never"];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("pods.eyebrow")}
        title={t("pods.title")}
        description={t("pods.desc")}
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>{t("pods.meta.total")}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{pods.length}</p>
            <p className="text-xs text-text-muted">{t("pods.meta.total.help")}</p>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm text-text-muted mb-1">{t("pods.filter.namespace")}</label>
              <select value={ns} onChange={(e) => setNs(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                <option value="all">{t("global")}</option>
                {namespaces.map((n) => (
                  <option key={n.name} value={n.name}>{n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">{t("pods.filter.name")}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="nginx" />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">{t("pods.filter.phase")}</label>
              <select value={phase} onChange={(e) => setPhase(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                {phases.map((p) => (
                  <option key={p || "all"} value={p}>{p || t("common.unknown")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">{t("pods.filter.restartPolicy")}</label>
              <select value={restartPolicy} onChange={(e) => setRestartPolicy(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                {restartPolicies.map((p) => (
                  <option key={p || "all"} value={p}>{p || t("common.unknown")}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left text-text-muted">
                  <th className="px-3 py-2">{t("pods.col.name")}</th>
                  <th className="px-3 py-2">{t("pods.col.containers")}</th>
                  <th className="px-3 py-2">{t("pods.col.ready")}</th>
                  <th className="px-3 py-2">{t("pods.col.node")}</th>
                  <th className="px-3 py-2">{t("pods.col.podIP")}</th>
                  <th className="px-3 py-2">{t("pods.col.phase")}</th>
                  <th className="px-3 py-2">{t("pods.col.created")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={7}>{t("common.loading")}</td></tr>
                ) : pods.length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={7}>{t("pods.empty")}</td></tr>
                ) : (
                  pods.map((p) => (
                    <tr key={`${p.namespace}/${p.name}`} className="border-t border-border hover:bg-hover">
                      <td className="px-3 py-2">
                        <Link href={`/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}`} className="text-primary hover:underline">
                          {p.name}
                        </Link>
                        <div className="text-xs text-text-muted">{p.namespace}</div>
                      </td>
                      <td className="px-3 py-2">
                        {(p.containers || []).join(", ")}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                          {(p.ready_containers ?? 0)}/{p.total_containers ?? 0}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div>{p.node_ip || "-"}</div>
                        <div className="text-xs text-text-muted">{p.node_name || ""}</div>
                      </td>
                      <td className="px-3 py-2 font-mono">{p.pod_ip || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={p.phase === "Running" ? "success" : p.phase === "Pending" ? "warning" : "neutral-light"} size="sm">
                          {p.phase || t("common.unknown")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

