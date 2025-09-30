"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { fetchNamespaces, queryKeys, type NamespaceSummaryResponse } from "@/lib/api";
import { fetchNetworkPolicies, type NetworkPolicySummary } from "@/lib/api";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function NetworkPoliciesPage() {
  const { t } = useI18n();
  const namespaces = useNamespaces();
  const [ns, setNs] = useState<string>("all");

  const { data, isLoading } = useQuery<NetworkPolicySummary[]>({
    queryKey: queryKeys.networkPolicies(ns),
    queryFn: () => fetchNetworkPolicies(ns),
  });
  const items = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Network"
        title="NetworkPolicies"
        description="List NetworkPolicy resources"
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>Total</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{items.length}</p>
          </div>
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
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>{t("common.loading")}</td></tr>
                ) : items.length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>No NetworkPolicies found</td></tr>
                ) : (
                  items.map((it) => (
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
        </CardContent>
      </Card>
    </div>
  );
}

