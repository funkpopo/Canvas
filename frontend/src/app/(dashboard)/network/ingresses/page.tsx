"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { fetchNamespaces, queryKeys, type NamespaceSummaryResponse } from "@/lib/api";
import {
  fetchIngresses,
  fetchIngressYaml,
  updateIngressYaml,
  deleteIngress,
  type IngressSummary,
  type YamlContentResponse,
} from "@/lib/api";
import { YamlEditor } from "@/shared/ui/yaml-editor";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function IngressesPage() {
  const { t } = useI18n();
  const namespaces = useNamespaces();
  const [ns, setNs] = useState<string>("all");

  const { data, isLoading } = useQuery<IngressSummary[]>({
    queryKey: queryKeys.ingresses(ns),
    queryFn: () => fetchIngresses(ns),
  });
  const items = data ?? [];

  const [editing, setEditing] = useState<{ ns: string; name: string } | null>(null);
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => {
    (async () => {
      if (!editing) return;
      const y: YamlContentResponse = await fetchIngressYaml(editing.ns, editing.name);
      setYaml(y.yaml ?? "");
    })();
  }, [editing]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("network.header")}
        title={t("ingresses.title")}
        description={t("ingresses.desc")}
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>{t("common.total")}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{items.length}</p>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("pods.filter.namespace")}</label>
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
                  <th className="px-3 py-2">{t("ingresses.col.name")}</th>
                  <th className="px-3 py-2">{t("ingresses.col.namespace")}</th>
                  <th className="px-3 py-2">{t("ingresses.col.hosts")}</th>
                  <th className="px-3 py-2">{t("ingresses.col.created")}</th>
                  <th className="px-3 py-2">{t("ingresses.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={4}>{t("common.loading")}</td></tr>
                ) : items.length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={4}>{t("ingresses.empty")}</td></tr>
                ) : (
                  items.map((it) => (
                    <tr key={`${it.namespace}/${it.name}`} className="border-t border-border hover:bg-hover">
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2">{it.namespace}</td>
                      <td className="px-3 py-2">{(it.hosts ?? []).join(", ")}</td>
                      <td className="px-3 py-2">{it.created_at ? new Date(it.created_at).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 flex gap-2">
                        <button className="text-xs underline" onClick={() => setEditing({ ns: it.namespace, name: it.name })}>{t("deploy.yaml.edit")}</button>
                        <button className="text-xs text-error underline" onClick={async () => { if (confirm(t("ingresses.confirm.delete"))) { await deleteIngress(it.namespace, it.name); location.reload(); } }}>{t("actions.delete")}</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <YamlEditor
        open={Boolean(editing)}
        title={`${t("deploy.yaml.edit")} ${editing ? `${editing.ns}/${editing.name}` : ""}`}
        description={t("ingresses.desc")}
        initialYaml={yaml}
        onClose={() => setEditing(null)}
        validateKind="Ingress"
        onSave={async (y) => {
          if (!editing) return;
          await updateIngressYaml(editing.ns, editing.name, y);
          alert(t("alert.yaml.applied"));
        }}
      />
    </div>
  );
}
