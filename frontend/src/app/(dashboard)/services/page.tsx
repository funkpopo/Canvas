"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";
import {
  createServiceFromYaml,
  deleteService,
  fetchNamespaces,
  fetchServiceYaml,
  fetchServices,
  queryKeys,
  updateServiceYaml,
  type NamespaceSummaryResponse,
  type ServiceSummaryResponse,
  type YamlContentResponse,
} from "@/lib/api";
import { Modal } from "@/shared/ui/modal";

export default function ServicesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: namespaces } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });

  const [ns, setNs] = useState<string>("default");
  const [editing, setEditing] = useState<{ ns: string; name: string } | null>(null);
  const [yaml, setYaml] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);

  useEffect(() => {
    if (!namespaces || namespaces.length === 0) return;
    if (!ns) setNs(namespaces.find((n) => n.name === "default")?.name || namespaces[0].name);
  }, [namespaces, ns]);

  const { data: services, isLoading } = useQuery<ServiceSummaryResponse[]>({
    queryKey: queryKeys.services(ns),
    queryFn: () => fetchServices(ns),
    enabled: Boolean(ns),
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.services(ns) });

  const openEdit = async (n: string) => {
    const y = await fetchServiceYaml(ns, n);
    setYaml(y.yaml || "");
    setEditing({ ns, name: n });
  };

  const applyEdit = async () => {
    if (!editing) return;
    await updateServiceYaml(editing.ns, editing.name, yaml);
    setEditing(null);
    setYaml("");
    reload();
  };

  const onDelete = async (n: string) => {
    if (!confirm(t("svc.confirm.delete", { name: n }))) return;
    await deleteService(ns, n);
    reload();
  };

  const openCreate = () => {
    const skeleton = `apiVersion: v1
kind: Service
metadata:
  name: example-service
  namespace: ${ns || "default"}
spec:
  type: ClusterIP
  selector:
    app: example
  ports:
    - name: http
      port: 80
      targetPort: 80`;
    setYaml(skeleton);
    setCreating(true);
  };

  const applyCreate = async () => {
    await createServiceFromYaml(yaml);
    setCreating(false);
    setYaml("");
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("svc.eyebrow")}
        title={t("svc.title")}
        description={t("svc.desc")}
        actions={
          <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={openCreate}>{t("svc.new")}</button>
        }
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>{t("svc.meta.total")}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{services?.length ?? 0}</p>
            <p className="text-xs text-text-muted">{t("svc.meta.total.help")}</p>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm text-text-muted mb-1">{t("svc.filter.namespace")}</label>
              <select value={ns} onChange={(e) => setNs(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                {(namespaces ?? []).map((n) => (
                  <option key={n.name} value={n.name}>{n.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left text-text-muted">
                  <th className="px-3 py-2">{t("svc.col.name")}</th>
                  <th className="px-3 py-2">{t("svc.col.type")}</th>
                  <th className="px-3 py-2">{t("svc.col.clusterIP")}</th>
                  <th className="px-3 py-2">{t("svc.col.ports")}</th>
                  <th className="px-3 py-2">{t("svc.col.created")}</th>
                  <th className="px-3 py-2">{t("svc.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={6}>{t("common.loading")}</td></tr>
                ) : (services ?? []).length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={6}>{t("svc.empty")}</td></tr>
                ) : (
                  (services ?? []).map((s) => (
                    <tr key={`${s.namespace}/${s.name}`} className="border-t border-border hover:bg-hover">
                      <td className="px-3 py-2">
                        <div className="text-text-primary font-medium">{s.name}</div>
                        <div className="text-xs text-text-muted">{s.namespace}</div>
                      </td>
                      <td className="px-3 py-2">{s.type || "-"}</td>
                      <td className="px-3 py-2 font-mono">{s.cluster_ip || "-"}</td>
                      <td className="px-3 py-2">
                        {(s.ports || []).length === 0 ? (
                          <span className="text-text-muted">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(s.ports || []).map((p, idx) => (
                              <Badge key={idx} variant="neutral-light" size="sm" className={badgePresets.metric}>
                                {p.name ? `${p.name}: ` : ""}{p.port}
                                {p.target_port ? `->${p.target_port}` : ""}
                                {p.node_port ? `:${p.node_port}` : ""}
                                {p.protocol ? `/${p.protocol}` : ""}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">{s.created_at ? new Date(s.created_at).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button className="rounded border border-border px-2 py-1 text-xs" onClick={() => openEdit(s.name)}>{t("svc.edit")}</button>
                          <button className="rounded border border-destructive text-destructive px-2 py-1 text-xs" onClick={() => onDelete(s.name)}>{t("svc.delete")}</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`${t("svc.yaml.title")} ${editing.ns}/${editing.name}`} className="max-w-4xl">
          <textarea value={yaml} onChange={(e) => setYaml(e.target.value)} className="h-96 w-full rounded-md border border-border bg-surface p-2 font-mono text-sm" />
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setEditing(null)}>{t("actions.cancel")}</button>
            <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={applyEdit}>{t("svc.yaml.save")}</button>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal open onClose={() => setCreating(false)} title={t("svc.yaml.createTitle")} className="max-w-4xl">
          <textarea value={yaml} onChange={(e) => setYaml(e.target.value)} className="h-96 w-full rounded-md border border-border bg-surface p-2 font-mono text-sm" />
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setCreating(false)}>{t("actions.cancel")}</button>
            <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={applyCreate}>{t("svc.yaml.create")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

