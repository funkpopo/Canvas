"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { YamlEditor } from "@/shared/ui/yaml-editor";
import { useConfirm } from "@/hooks/useConfirm";
import {
  fetchNamespaces,
  queryKeys,
  type NamespaceSummaryResponse,
  fetchConfigMaps,
  type ConfigMapSummary,
  fetchConfigMapYaml,
  type YamlContentResponse,
  updateConfigMapYaml,
  deleteConfigMap,
} from "@/lib/api";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function ConfigMapsPage() {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const namespaces = useNamespaces();
  const [ns, setNs] = useState<string>("all");

  const { data, isLoading } = useQuery<ConfigMapSummary[]>({
    queryKey: queryKeys.configMaps(ns),
    queryFn: () => fetchConfigMaps(ns),
  });
  const items = data ?? [];

  const [editing, setEditing] = useState<{ ns: string; name: string } | null>(null);
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => {
    (async () => {
      if (!editing) return;
      const y: YamlContentResponse = await fetchConfigMapYaml(editing.ns, editing.name);
      setYaml(y.yaml ?? "");
    })();
  }, [editing]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("network.header")}
        title={t("configmaps.title")}
        description={t("configmaps.desc")}
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
                  <th className="px-3 py-2">{t("configmaps.col.name")}</th>
                  <th className="px-3 py-2">{t("configmaps.col.namespace")}</th>
                  <th className="px-3 py-2">{t("configmaps.col.created")}</th>
                  <th className="px-3 py-2">{t("configmaps.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>{t("common.loading")}</td></tr>
                ) : items.length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>{t("configmaps.empty")}</td></tr>
                ) : (
                  items.map((it) => (
                    <tr key={`${it.namespace}/${it.name}`} className="border-t border-border hover:bg-hover">
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2">{it.namespace}</td>
                      <td className="px-3 py-2">{it.created_at ? new Date(it.created_at).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 flex gap-2">
                        <button className="text-xs underline" onClick={() => setEditing({ ns: it.namespace, name: it.name })}>{t("deploy.yaml.edit")}</button>
                        <button className="text-xs text-error underline" onClick={async () => { 
                          const confirmed = await confirm({ title: t("configmaps.confirm.delete") });
                          if (confirmed) { await deleteConfigMap(it.namespace, it.name); location.reload(); }
                        }}>{t("actions.delete")}</button>
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
        description={t("configmaps.desc")}
        initialYaml={yaml}
        onClose={() => setEditing(null)}
        validateKind="ConfigMap"
        onSave={async (y) => {
          if (!editing) return;
          await updateConfigMapYaml(editing.ns, editing.name, y);
          alert(t("alert.yaml.applied"));
        }}
      />
      <ConfirmDialogComponent />
    </div>
  );
}

