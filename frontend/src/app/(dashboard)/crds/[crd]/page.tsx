"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { YamlEditor } from "@/shared/ui/yaml-editor";
import {
  fetchNamespaces,
  fetchCrds,
  fetchCrdResources,
  fetchGenericYaml,
  updateGenericYaml,
  deleteGenericResource,
  queryKeys,
  type NamespaceSummaryResponse,
  type CRDSummaryResponse,
  type GenericResourceEntryResponse,
  type YamlContentResponse,
} from "@/lib/api";

function useNamespaces() {
  const { data } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });
  return data ?? [];
}

export default function CrdResourcesPage() {
  const { t } = useI18n();
  const params = useParams<{ crd: string }>();
  const crdName = decodeURIComponent(params.crd);

  const namespaces = useNamespaces();
  const { data: crds } = useQuery<CRDSummaryResponse[]>({ queryKey: queryKeys.crds, queryFn: fetchCrds });
  const crd = useMemo(() => (crds ?? []).find((c) => c.name === crdName), [crds, crdName]);
  const preferredVersion = (crd?.versions ?? [])[0] ?? "v1";
  const [ns, setNs] = useState<string>("all");

  const { data, isLoading, refetch } = useQuery<GenericResourceEntryResponse[]>({
    queryKey: queryKeys.crdResources(crdName, ns),
    queryFn: () => fetchCrdResources(crdName, ns),
    enabled: Boolean(crdName),
  });
  const items = data ?? [];

  const [editing, setEditing] = useState<{ name: string; namespace?: string | null } | null>(null);
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => {
    (async () => {
      if (!editing || !crd) return;
      const y: YamlContentResponse = await fetchGenericYaml(crd.group, preferredVersion, crd.plural, editing.name, editing.namespace ?? undefined);
      setYaml(y.yaml ?? "");
    })();
  }, [editing, crd, preferredVersion]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("crds.header")}
        title={`${t("crds.resources.title")} ${crdName}`}
        description={t("crds.resources.desc")}
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>{t("common.total")}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{items.length}</p>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center gap-4">
            {crd?.scope === "Namespaced" && (
              <div>
                <label className="block text-sm text-text-muted mb-1">{t("pods.filter.namespace")}</label>
                <select value={ns} onChange={(e) => setNs(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm max-w-xs">
                  <option value="all">{t("global")}</option>
                  {namespaces.map((n) => (
                    <option key={n.name} value={n.name}>{n.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="text-sm text-text-muted">
              <span className="mr-2">{t("crds.field.group")}: {crd?.group}</span>
              <span className="mr-2">{t("crds.field.version")}: {preferredVersion}</span>
              <span>{t("crds.field.plural")}: {crd?.plural}</span>
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left text-text-muted">
                  {crd?.scope === "Namespaced" && <th className="px-3 py-2">{t("crds.col.namespace")}</th>}
                  <th className="px-3 py-2">{t("crds.col.name")}</th>
                  <th className="px-3 py-2">{t("crds.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>{t("common.loading")}</td></tr>
                ) : items.length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={3}>{t("crds.resources.empty")}</td></tr>
                ) : (
                  items.map((it) => (
                    <tr key={`${it.namespace ?? "-"}/${it.name}`} className="border-t border-border hover:bg-hover">
                      {crd?.scope === "Namespaced" && <td className="px-3 py-2">{it.namespace ?? "-"}</td>}
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2 flex gap-2">
                        <button className="text-xs underline" onClick={() => setEditing({ name: it.name, namespace: it.namespace })}>{t("deploy.yaml.edit")}</button>
                        <button
                          className="text-xs text-error underline"
                          onClick={async () => {
                            if (!crd) return;
                            if (confirm(t("crds.confirm.delete"))) {
                              await deleteGenericResource(crd.group, preferredVersion, crd.plural, it.name, it.namespace ?? undefined);
                              await refetch();
                            }
                          }}
                        >
                          {t("actions.delete")}
                        </button>
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
        title={`${t("deploy.yaml.edit")} ${editing ? `${editing.namespace ? `${editing.namespace}/` : ""}${editing.name}` : ""}`}
        description={t("crds.resources.desc")}
        initialYaml={yaml}
        onClose={() => setEditing(null)}
        // Can't validate kind generically; skip validateKind
        onSave={async (y) => {
          if (!editing || !crd) return;
          await updateGenericYaml(crd.group, preferredVersion, crd.plural, editing.name, y, editing.namespace ?? undefined);
          alert(t("alert.yaml.applied"));
        }}
      />
    </div>
  );
}

