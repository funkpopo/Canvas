"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Terminal, ScrollText, ArrowLeftRight, FileCode, Star } from "lucide-react";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { VirtualTable } from "@/shared/ui/virtual-table";
import { useK8sAbilities } from "@/features/auth/hooks/useAbilities";
import { deletePod, fetchNamespaces, fetchPodsSummary, queryKeys, type NamespaceSummaryResponse, type PodSummaryResponse } from "@/lib/api";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function PodsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  const namespaces = useNamespaces();

  const [ns, setNs] = useState<string>("all");
  const [name, setName] = useState<string>("");
  const [phase, setPhase] = useState<string>("");
  const [restartPolicy, setRestartPolicy] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<{ ns: string; name: string }[]>([]);
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [forceDelete, setForceDelete] = useState<boolean>(false);
  const [graceInput, setGraceInput] = useState<string>("");

  useEffect(() => {
    if (ns === "all" && namespaces.length > 0) return; // keep all by default
  }, [namespaces, ns]);

  const { data, isLoading, isError } = useQuery<PodSummaryResponse[]>({
    queryKey: queryKeys.podsSummary(ns, name, phase, restartPolicy),
    queryFn: () => fetchPodsSummary({ namespace: ns === "all" ? undefined : ns, name, phase, restart_policy: restartPolicy }),
  });

  const pods = data ?? [];
  const allKeys = useMemo(() => pods.map((p) => `${p.namespace}/${p.name}`), [pods]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const hasSelection = selected.size > 0;

  // Abilities (RBAC): for current namespace filter only
  const { canDeletePods, canExecPods, canViewLogs } = useK8sAbilities(ns === "all" ? undefined : ns);

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (allSelected) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        allKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const deleteMut = useMutation({
    mutationFn: async () => {
      const targets = pods.filter((p) => selected.has(`${p.namespace}/${p.name}`));
      if (targets.length === 0) return;
      // Build delete options from modal state
      let opts: { gracePeriodSeconds?: number | null } | undefined = undefined;
      if (forceDelete) {
        opts = { gracePeriodSeconds: 0 };
      } else if (graceInput.trim() !== "") {
        const n = Number(graceInput.trim());
        if (!Number.isNaN(n) && n >= 0) {
          opts = { gracePeriodSeconds: n };
        }
      }
      await Promise.all(
        targets.map((p) => deletePod(p.namespace, p.name, opts))
      );
    },
    onSuccess: async () => {
      setSelected(new Set());
      setIsDeleteOpen(false);
      setForceDelete(false);
      setGraceInput("");
      alert(t("alert.pods.deleted"));
      await qc.invalidateQueries({ queryKey: queryKeys.podsSummary(ns, name, phase, restartPolicy) });
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("error.pods.delete"));
    },
  });

  const phases = ["", "Running", "Pending", "Succeeded", "Failed", "Unknown"];
  const restartPolicies = ["", "Always", "OnFailure", "Never"];

  // Load bookmarks and recent visits from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bookmarkedPods");
      if (raw) setBookmarks(new Set<string>(JSON.parse(raw)));
    } catch {}
    try {
      const raw = localStorage.getItem("recentPods");
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  function toggleBookmark(key: string) {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem("bookmarkedPods", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }

  // Virtualization renders the full filtered list (no client-side pagination)

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

          <div className="flex items-center justify-between">
            {/* Recent visits */}
            <div className="hidden md:flex items-center gap-2">
              {recent.slice(0, 6).map((r) => (
                <Link key={`${r.ns}/${r.name}`} href={`/pods/${encodeURIComponent(r.ns)}/${encodeURIComponent(r.name)}?tab=overview`} className="text-xs text-text-muted hover:underline">
                  {r.ns}/{r.name}
                </Link>
              ))}
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setIsDeleteOpen(true)}
              disabled={!hasSelection || (ns !== "all" && !canDeletePods)}
            >
              {t("pods.deleteSelected")}
            </Button>
          </div>

          {isLoading ? (
            <div className="rounded-md border border-border mt-2">
              <EmptyState title={t("common.loading")} />
            </div>
          ) : isError ? (
            <div className="rounded-md border border-border mt-2">
              <ErrorState message={t("pod.error")} />
            </div>
          ) : pods.length === 0 ? (
            <div className="rounded-md border border-border mt-2">
              <EmptyState title={t("pods.empty")} />
            </div>
          ) : (
            <VirtualTable
              height={520}
              estimateSize={44}
              count={pods.length}
              renderHeader={() => (
                <tr className="text-left text-text-muted">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-border bg-surface"
                      aria-label="select all"
                    />
                  </th>
                  <th className="px-3 py-2">{t("pods.col.name")}</th>
                  <th className="px-3 py-2">{t("pods.col.containers")}</th>
                  <th className="px-3 py-2">{t("pods.col.ready")}</th>
                  <th className="px-3 py-2">{t("pods.col.node")}</th>
                  <th className="px-3 py-2">{t("pods.col.podIP")}</th>
                  <th className="px-3 py-2">{t("pods.col.phase")}</th>
                  <th className="px-3 py-2">{t("pods.col.created")}</th>
                  <th className="px-3 py-2 w-36">{t("svc.col.actions")}</th>
                </tr>
              )}
              renderRow={(idx) => {
                const p = pods[idx];
                const key = `${p.namespace}/${p.name}`;
                const disabledLogs = ns !== "all" && !canViewLogs;
                const disabledExec = ns !== "all" && !canExecPods;
                return (
                  <tr key={key} className="border-t border-border hover:bg-hover">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                        className="h-4 w-4 rounded border-border bg-surface"
                        aria-label={`select ${p.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}`} className="text-primary hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-text-muted">{p.namespace}</div>
                    </td>
                    <td className="px-3 py-2">{(p.containers || []).join(", ")}</td>
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
                    <td className="px-3 py-2">{p.created_at ? new Date(p.created_at).toLocaleString() : "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          title={t("pods.actions.logs") as string}
                          onClick={() => !disabledLogs && router.push(`/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}?tab=logs`)}
                          className={`$${"text-text-muted hover:text-primary"} ${disabledLogs ? "opacity-50 pointer-events-none" : ""}`}
                          aria-disabled={disabledLogs}
                        >
                          <ScrollText className="h-4 w-4" />
                        </button>
                        <button
                          title={t("pods.actions.terminal") as string}
                          onClick={() => !disabledExec && router.push(`/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}?tab=terminal`)}
                          className={`text-text-muted hover:text-primary ${disabledExec ? "opacity-50 pointer-events-none" : ""}`}
                          aria-disabled={disabledExec}
                        >
                          <Terminal className="h-4 w-4" />
                        </button>
                        <button
                          title={t("actions.portForward") as string}
                          onClick={() => router.push(`/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}?tab=portForward`)}
                          className="text-text-muted hover:text-primary"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                        <button
                          title={t("pods.actions.yaml") as string}
                          onClick={() => router.push(`/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}?tab=overview`)}
                          className="text-text-muted hover:text-primary"
                        >
                          <FileCode className="h-4 w-4" />
                        </button>
                        <button
                          title={t("pods.actions.bookmark") as string}
                          onClick={() => toggleBookmark(key)}
                          className={bookmarks.has(key) ? "text-accent" : "text-text-muted hover:text-primary"}
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
          )}

          {/* List meta */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="text-text-muted">{pods.length} {t("pods.meta.total.help")}</div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={isDeleteOpen}
        onClose={() => {
          if (deleteMut.isPending) return;
          setIsDeleteOpen(false);
        }}
        title={t("pods.deleteDialog.title")}
        description={t("pods.deleteDialog.desc")}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteOpen(false)}
              disabled={deleteMut.isPending}
            >
              {t("pods.deleteDialog.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? t("pods.deleteDialog.deleting") : t("pods.deleteDialog.confirm")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-text-muted mb-1">{t("pods.col.name")}</p>
            <div className="max-h-40 overflow-auto rounded border border-border p-2 text-sm bg-surface-raised">
              {(pods.filter((p) => selected.has(`${p.namespace}/${p.name}`)) || []).map((p) => (
                <div key={`${p.namespace}/${p.name}`} className="flex items-center justify-between py-0.5">
                  <span className="font-mono">{p.namespace}/{p.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm text-text-muted">{t("pods.deleteDialog.grace")}</label>
              <input
                type="number"
                min={0}
                value={graceInput}
                onChange={(e) => setGraceInput(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
                placeholder="30"
                disabled={forceDelete}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-surface"
                />
                {t("pods.forceDelete")}
              </label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
