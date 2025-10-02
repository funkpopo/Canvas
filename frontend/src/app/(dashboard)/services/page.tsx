"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";
import { useConfirm } from "@/hooks/useConfirm";
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
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

type ServiceForm = {
  name: string;
  namespace: string;
  type: "ClusterIP" | "NodePort" | "LoadBalancer";
  selector: { key: string; value: string }[];
  ports: { name?: string; protocol?: "TCP" | "UDP" | "SCTP"; port: number; targetPort?: number; nodePort?: number }[];
};

export default function ServicesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const { data: namespaces } = useQuery<NamespaceSummaryResponse[]>({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });

  const [ns, setNs] = useState<string>("default");
  const [editing, setEditing] = useState<{ ns: string; name: string } | null>(null);
  const [yaml, setYaml] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [editTab, setEditTab] = useState<"form" | "yaml">("form");
  const [createTab, setCreateTab] = useState<"form" | "yaml">("form");
  const [form, setForm] = useState<ServiceForm | null>(null);
  const [createForm, setCreateForm] = useState<ServiceForm | null>(null);
  const [pf, setPf] = useState<{ open: boolean; name: string; ports: { label: string; value: string }[]; selected: string; local: string } | null>(null);

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
    const yml = y.yaml || "";
    setYaml(yml);
    try {
      const obj: any = parseYaml(yml);
      const selectorEntries = Object.entries(obj?.spec?.selector || {}).map(([k, v]) => ({ key: String(k), value: String(v) }));
      const portsArr = (obj?.spec?.ports || []).map((p: any) => ({
        name: p?.name ?? undefined,
        protocol: p?.protocol ?? undefined,
        port: Number(p?.port ?? 0),
        targetPort: p?.targetPort != null ? Number(p.targetPort) : undefined,
        nodePort: p?.nodePort != null ? Number(p.nodePort) : undefined,
      }));
      setForm({
        name: obj?.metadata?.name || n,
        namespace: obj?.metadata?.namespace || ns,
        type: (obj?.spec?.type as ServiceForm["type"]) || "ClusterIP",
        selector: selectorEntries,
        ports: portsArr.length > 0 ? portsArr : [{ port: 80, targetPort: 80, name: "http", protocol: "TCP" }],
      });
    } catch {
      setForm({ name: n, namespace: ns, type: "ClusterIP", selector: [], ports: [{ port: 80, targetPort: 80, name: "http", protocol: "TCP" }] });
    }
    setEditTab("form");
    setEditing({ ns, name: n });
  };

  const buildYamlFromForm = (f: ServiceForm) => {
    const spec: any = {
      type: f.type,
      selector: Object.fromEntries((f.selector || []).filter((p) => p.key).map((p) => [p.key, p.value ?? ""])) ,
      ports: (f.ports || []).filter((p) => p.port).map((p) => ({
        ...(p.name ? { name: p.name } : {}),
        port: Number(p.port),
        ...(p.targetPort != null && p.targetPort !== undefined ? { targetPort: Number(p.targetPort) } : {}),
        ...(p.protocol ? { protocol: p.protocol } : {}),
        ...(f.type === "NodePort" && p.nodePort ? { nodePort: Number(p.nodePort) } : {}),
      })),
    };
    const doc: any = {
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: f.name, namespace: f.namespace },
      spec,
    };
    return stringifyYaml(doc);
  };

  const applyEdit = async () => {
    if (!editing) return;
    let finalYaml = yaml;
    if (editTab === "form" && form) finalYaml = buildYamlFromForm(form);
    await updateServiceYaml(editing.ns, editing.name, finalYaml);
    setEditing(null);
    setYaml("");
    setForm(null);
    reload();
  };

  const onDelete = async (n: string) => {
    const confirmed = await confirm({
      title: t("svc.confirm.delete", { name: n }),
    });
    if (!confirmed) return;
    await deleteService(ns, n);
    reload();
  };

  const openCreate = () => {
    const defaultForm: ServiceForm = {
      name: "example-service",
      namespace: ns || "default",
      type: "ClusterIP",
      selector: [{ key: "app", value: "example" }],
      ports: [{ name: "http", port: 80, targetPort: 80, protocol: "TCP" }],
    };
    setCreateForm(defaultForm);
    setYaml(stringifyYaml({
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: defaultForm.name, namespace: defaultForm.namespace },
      spec: {
        type: defaultForm.type,
        selector: Object.fromEntries(defaultForm.selector.map((s) => [s.key, s.value])),
        ports: defaultForm.ports.map((p) => ({ name: p.name, port: p.port, targetPort: p.targetPort, protocol: p.protocol })),
      },
    }));
    setCreateTab("form");
    setCreating(true);
  };

  const applyCreate = async () => {
    let finalYaml = yaml;
    if (createTab === "form" && createForm) finalYaml = buildYamlFromForm(createForm);
    await createServiceFromYaml(finalYaml);
    setCreating(false);
    setYaml("");
    setCreateForm(null);
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("svc.eyebrow")}
        title={t("svc.title")}
        description={t("svc.desc")}
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
          <div className="flex items-center justify-between">
            <div />
            <Button onClick={openCreate}>{t("svc.new")}</Button>
          </div>
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
                          <button
                            className="rounded border border-border px-2 py-1 text-xs"
                            onClick={() => {
                              const options = (s.ports || []).map((p) => {
                                const svcPort = p.port ?? 0;
                                const label = `${p.name ? p.name + ': ' : ''}${svcPort}${p.protocol ? '/' + p.protocol : ''}${p.target_port ? ' -> ' + p.target_port : ''}`;
                                return { label, value: String(svcPort) };
                              });
                              const first = options[0]?.value ?? '80';
                              const defLocal = first || '8080';
                              setPf({ open: true, name: s.name, ports: options, selected: first, local: defLocal });
                            }}
                          >
                            {t("actions.portForward")}
                          </button>
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
        <Modal open onClose={() => setEditing(null)} title={`${t("svc.editTitle")} ${editing.ns}/${editing.name}`} className="max-w-4xl">
          <Tabs value={editTab} onValueChange={(v) => setEditTab(v as any)}>
            <TabsList>
              <TabsTrigger value="form">{t("svc.tab.form")}</TabsTrigger>
              <TabsTrigger value="yaml">{t("svc.tab.yaml")}</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="pt-2">
              {form && (
                <ServiceFormEditor value={form} onChange={setForm} nsOptions={(namespaces ?? []).map((n) => n.name)} />
              )}
            </TabsContent>
            <TabsContent value="yaml" className="pt-2">
              <textarea value={yaml} onChange={(e) => setYaml(e.target.value)} className="h-96 w-full rounded-md border border-border bg-surface p-2 font-mono text-sm" />
            </TabsContent>
          </Tabs>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setEditing(null)}>{t("actions.cancel")}</button>
            <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={applyEdit}>{t("svc.save")}</button>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal open onClose={() => setCreating(false)} title={t("svc.createTitle")} className="max-w-4xl">
          <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as any)}>
            <TabsList>
              <TabsTrigger value="form">{t("svc.tab.form")}</TabsTrigger>
              <TabsTrigger value="yaml">{t("svc.tab.yaml")}</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="pt-2">
              {createForm && (
                <ServiceFormEditor value={createForm} onChange={setCreateForm} nsOptions={(namespaces ?? []).map((n) => n.name)} />
              )}
            </TabsContent>
            <TabsContent value="yaml" className="pt-2">
              <textarea value={yaml} onChange={(e) => setYaml(e.target.value)} className="h-96 w-full rounded-md border border-border bg-surface p-2 font-mono text-sm" />
            </TabsContent>
          </Tabs>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setCreating(false)}>{t("actions.cancel")}</button>
            <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={applyCreate}>{t("svc.create")}</button>
          </div>
        </Modal>
      )}

      {pf?.open && (
        <Modal open onClose={() => setPf(null)} title={`${t("port.svc.title")} ${ns}/${pf.name}`} className="max-w-2xl">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm text-text-muted">{t("port.svc.port")}</label>
                <select
                  value={pf.selected}
                  onChange={(e) => setPf({ ...pf, selected: e.target.value })}
                  className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
                >
                  {pf.ports.length === 0 ? (
                    <option value="80">80</option>
                  ) : (
                    pf.ports.map((opt, idx) => (
                      <option key={idx} value={opt.value}>{opt.label}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-text-muted">{t("port.local")}</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={pf.local}
                  onChange={(e) => setPf({ ...pf, local: e.target.value })}
                  className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className={`${badgePresets.label} text-text-muted`}>{t("port.command")}</div>
              <PortForwardPreview ns={ns} name={pf.name} local={pf.local} remote={pf.selected} kind="svc" />
              <div className="text-xs text-text-muted">{t("port.help")}</div>
            </div>
          </div>
        </Modal>
      )}
      <ConfirmDialogComponent />
    </div>
  );
}

function ServiceFormEditor({ value, onChange, nsOptions }: { value: ServiceForm; onChange: (v: ServiceForm) => void; nsOptions: string[] }) {
  const { t } = useI18n();

  function update<K extends keyof ServiceForm>(key: K, v: ServiceForm[K]) {
    onChange({ ...value, [key]: v });
  }

  function updateSelector(i: number, k: keyof ServiceForm["selector"][number], v: string) {
    const next = [...value.selector];
    next[i] = { ...next[i], [k]: v };
    onChange({ ...value, selector: next });
  }

  function addSelector() {
    onChange({ ...value, selector: [...value.selector, { key: "", value: "" }] });
  }

  function removeSelector(i: number) {
    const next = value.selector.filter((_, idx) => idx !== i);
    onChange({ ...value, selector: next });
  }

  function updatePort(i: number, k: keyof ServiceForm["ports"][number], v: any) {
    const next = [...value.ports];
    // ensure numbers for numeric fields
    const numeric = ["port", "targetPort", "nodePort"] as const;
    const vv: any = numeric.includes(k as any) ? (v === "" ? undefined : Number(v)) : v;
    next[i] = { ...next[i], [k]: vv } as any;
    onChange({ ...value, ports: next });
  }

  function addPort() {
    onChange({ ...value, ports: [...value.ports, { name: "", port: 80, targetPort: 80, protocol: "TCP" }] });
  }

  function removePort(i: number) {
    const next = value.ports.filter((_, idx) => idx !== i);
    onChange({ ...value, ports: next });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("svc.form.name")}</label>
          <input value={value.name} onChange={(e) => update("name", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("svc.form.namespace")}</label>
          <select value={value.namespace} onChange={(e) => update("namespace", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
            {nsOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("svc.form.type")}</label>
          <select value={value.type} onChange={(e) => update("type", e.target.value as any)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
            <option value="ClusterIP">ClusterIP</option>
            <option value="NodePort">NodePort</option>
            <option value="LoadBalancer">LoadBalancer</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className={`${badgePresets.label} text-text-muted`}>{t("svc.form.selector")}</div>
        <div className="space-y-2">
          {value.selector.map((s, idx) => (
            <div key={idx} className="grid grid-cols-5 gap-2 items-center">
              <input
                value={s.key}
                onChange={(e) => updateSelector(idx, "key", e.target.value)}
                placeholder="key"
                className="col-span-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
              />
              <input
                value={s.value}
                onChange={(e) => updateSelector(idx, "value", e.target.value)}
                placeholder="value"
                className="col-span-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
              />
              <Button variant="outline" size="sm" onClick={() => removeSelector(idx)}>{t("svc.form.remove")}</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addSelector}>{t("svc.form.addSelector")}</Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className={`${badgePresets.label} text-text-muted`}>{t("svc.form.ports")}</div>
        <div className="space-y-2">
          {value.ports.map((p, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={p.name ?? ""}
                onChange={(e) => updatePort(idx, "name", e.target.value)}
                placeholder={t("svc.form.portName")}
                className="col-span-3 rounded-md border border-border bg-surface px-2 py-1 text-sm"
              />
              <select
                value={p.protocol ?? "TCP"}
                onChange={(e) => updatePort(idx, "protocol", e.target.value)}
                className="col-span-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
              >
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="SCTP">SCTP</option>
              </select>
              <input
                type="number"
                min={1}
                max={65535}
                value={p.port ?? 80}
                onChange={(e) => updatePort(idx, "port", e.target.value)}
                placeholder={t("svc.form.port")}
                className="col-span-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
              />
              <input
                type="number"
                min={1}
                max={65535}
                value={p.targetPort ?? 80}
                onChange={(e) => updatePort(idx, "targetPort", e.target.value)}
                placeholder={t("svc.form.targetPort")}
                className="col-span-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
              />
              {value.type === "NodePort" && (
                <input
                  type="number"
                  min={30000}
                  max={32767}
                  value={p.nodePort ?? ""}
                  onChange={(e) => updatePort(idx, "nodePort", e.target.value)}
                  placeholder={t("svc.form.nodePort")}
                  className="col-span-2 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                />
              )}
              <Button variant="outline" size="sm" onClick={() => removePort(idx)}>{t("svc.form.remove")}</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addPort}>{t("svc.form.addPort")}</Button>
        </div>
      </div>
    </div>
  );
}

function PortForwardPreview({ ns, name, local, remote, kind }: { ns: string; name: string; local: string; remote: string; kind: 'pod' | 'svc' }) {
  const { t } = useI18n();
  const cmd = `kubectl -n ${ns} port-forward ${kind}/${name} ${local}:${remote}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      alert(t('port.copied'));
    } catch {
      alert(cmd);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs overflow-x-auto">{cmd}</code>
      <Button variant="outline" size="sm" onClick={copy}>{t('port.copy')}</Button>
    </div>
  );
}
