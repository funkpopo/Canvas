"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { fetchNamespaces, queryKeys, type NamespaceSummaryResponse } from "@/lib/api";
import { fetchConfigMaps, fetchSecrets, type ConfigMapSummary, type SecretSummary } from "@/lib/api";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function ConfigPage() {
  const { t } = useI18n();
  const namespaces = useNamespaces();
  const [ns, setNs] = useState<string>("all");

  const { data: cms, isLoading: cmLoading } = useQuery<ConfigMapSummary[]>({
    queryKey: queryKeys.configMaps(ns),
    queryFn: () => fetchConfigMaps(ns),
  });
  const { data: secs, isLoading: secLoading } = useQuery<SecretSummary[]>({
    queryKey: queryKeys.secrets(ns),
    queryFn: () => fetchSecrets(ns),
  });

  const cmItems = cms ?? [];
  const secItems = secs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Config"
        title="ConfigMaps & Secrets"
        description="Browse configuration resources"
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>ConfigMaps</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{cmItems.length}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Secrets</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{secItems.length}</p>
            </div>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Namespace</label>
            <select value={ns} onChange={(e) => setNs(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm max-w-xs">
              <option value="all">{t("global")}</option>
              {namespaces.map((n) => (
                <option key={n.name} value={n.name}>{n.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className={`${badgePresets.label} mb-2 text-text-muted`}>ConfigMaps</div>
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr className="text-left text-text-muted">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Namespace</th>
                      <th className="px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cmLoading ? (
                      <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>{t("common.loading")}</td></tr>
                    ) : cmItems.length === 0 ? (
                      <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>No ConfigMaps found</td></tr>
                    ) : (
                      cmItems.map((it) => (
                        <tr key={`${it.namespace}/${it.name}`} className="border-t border-border hover:bg-hover">
                          <td className="px-3 py-2">{it.name}</td>
                          <td className="px-3 py-2">{it.namespace}</td>
                          <td className="px-3 py-2">{it.created_at ? new Date(it.created_at).toLocaleString() : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className={`${badgePresets.label} mb-2 text-text-muted`}>Secrets</div>
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr className="text-left text-text-muted">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Namespace</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secLoading ? (
                      <tr><td className="px-3 py-4 text-text-muted" colSpan={4}>{t("common.loading")}</td></tr>
                    ) : secItems.length === 0 ? (
                      <tr><td className="px-3 py-4 text-text-muted" colSpan={4}>No Secrets found</td></tr>
                    ) : (
                      secItems.map((it) => (
                        <tr key={`${it.namespace}/${it.name}`} className="border-t border-border hover:bg-hover">
                          <td className="px-3 py-2">{it.name}</td>
                          <td className="px-3 py-2">{it.namespace}</td>
                          <td className="px-3 py-2">{it.type || "-"}</td>
                          <td className="px-3 py-2">{it.created_at ? new Date(it.created_at).toLocaleString() : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

