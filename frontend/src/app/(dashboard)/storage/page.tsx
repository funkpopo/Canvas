"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets, Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/i18n";
import {
  createStorageClass,
  deleteStorageClass,
  downloadVolumePath,
  fetchPvcs,
  fetchStorageClasses,
  fetchVolumeList,
  queryKeys,
  readVolumeFile,
  renameVolumePath,
  writeVolumeFile,
  type PersistentVolumeClaimSummaryResponse,
  type StorageClassCreatePayload,
  type StorageClassSummaryResponse,
  type VolumeFileEntryResponse,
} from "@/lib/api";
import { Modal } from "@/shared/ui/modal";

function CreateStorageClassForm({ onSubmit, onCancel }: { onSubmit: (p: StorageClassCreatePayload) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [prov, setProv] = useState("");
  const [allowExp, setAllowExp] = useState(true);
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-text-muted mb-1">{t("storage.sc.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="fast-sc" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">{t("storage.sc.provisioner")}</label>
        <input value={prov} onChange={(e) => setProv(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="kubernetes.io/no-provisioner" />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowExp} onChange={(e) => setAllowExp(e.target.checked)} />
        {t("storage.sc.allowExpansion")}
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={onCancel}>{t("actions.cancel")}</button>
        <button
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm"
          onClick={() => onSubmit({ name, provisioner: prov, allow_volume_expansion: allowExp })}
          disabled={!name || !prov}
        >
          {t("storage.sc.create")}
        </button>
      </div>
    </div>
  );
}

function VolumeBrowser({ ns, pvc, onClose }: { ns: string; pvc: string; onClose: () => void }) {
  const { t } = useI18n();
  const [path, setPath] = useState<string>("/");
  const [editPath, setEditPath] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: list } = useQuery({ queryKey: queryKeys.volumeList(ns, pvc, path), queryFn: () => fetchVolumeList(ns, pvc, path) });

  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.volumeList(ns, pvc, path) });

  const openEdit = async (p: string) => {
    const file = await readVolumeFile(ns, pvc, p);
    if (file && file.base64_data) {
      try {
        const decoded = atob(file.base64_data);
        setEditText(decoded);
        setEditPath(p);
      } catch {
        setEditText("");
        setEditPath(p);
      }
    }
  };

  const saveEdit = async () => {
    if (!editPath) return;
    const b64 = btoa(editText);
    await writeVolumeFile(ns, pvc, editPath, b64);
    setEditPath(null);
    setEditText("");
    reload();
  };

  const doRename = async (oldPath: string) => {
    const newName = prompt(t("storage.rename.prompt"));
    if (!newName) return;
    await renameVolumePath(ns, pvc, oldPath, newName);
    reload();
  };

  const dirs = useMemo(() => (list ?? []).filter((e) => e.is_dir), [list]);
  const files = useMemo(() => (list ?? []).filter((e) => !e.is_dir), [list]);

  const goUp = () => {
    if (path === "/") return;
    const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
    parts.pop();
    const p = "/" + parts.join("/");
    setPath(p || "/");
  };

  return (
    <Modal open onClose={onClose} title={`${t("storage.browser.title")} ${ns}/${pvc}`} className="max-w-5xl">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 border-r border-border pr-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-text-muted">{t("storage.browser.tree")}</div>
            <button className="text-xs text-primary" onClick={goUp}>{t("storage.browser.up")}</button>
          </div>
          <div className="space-y-1">
            <button className="block w-full text-left rounded px-2 py-1 text-sm hover:bg-muted" onClick={() => setPath("/")}>/</button>
            {dirs.map((d) => (
              <button key={d.path} className="block w-full truncate text-left rounded px-2 py-1 text-sm hover:bg-muted" title={d.name} onClick={() => setPath(d.path)}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-text-muted">{t("storage.browser.path")}: <span className="font-mono text-text-primary">{path}</span></div>
          </div>
          <div className="overflow-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted text-text-muted">
                <tr>
                  <th className="px-2 py-1 text-left">{t("storage.browser.name")}</th>
                  <th className="px-2 py-1 text-left">{t("storage.browser.perms")}</th>
                  <th className="px-2 py-1 text-left">{t("storage.browser.size")}</th>
                  <th className="px-2 py-1 text-left">{t("storage.browser.mtime")}</th>
                  <th className="px-2 py-1 text-left">{t("storage.browser.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(list ?? []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-2 text-text-muted" colSpan={5}>{t("storage.browser.empty")}</td>
                  </tr>
                ) : (
                  <>
                    {dirs.map((e) => (
                      <tr key={e.path} className="hover:bg-muted/50">
                        <td className="px-2 py-1 font-medium">📁 {e.name}</td>
                        <td className="px-2 py-1">{e.permissions ?? ""}</td>
                        <td className="px-2 py-1">-</td>
                        <td className="px-2 py-1">{e.mtime ?? ""}</td>
                        <td className="px-2 py-1">
                          <button className="text-xs text-primary" onClick={() => setPath(e.path)}>{t("storage.browser.open")}</button>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-primary" onClick={() => doRename(e.path)}>{t("storage.rename")}</button>
                        </td>
                      </tr>
                    ))}
                    {files.map((e) => (
                      <tr key={e.path} className="hover:bg-muted/50">
                        <td className="px-2 py-1">📄 {e.name}</td>
                        <td className="px-2 py-1">{e.permissions ?? ""}</td>
                        <td className="px-2 py-1">{e.size ?? ""}</td>
                        <td className="px-2 py-1">{e.mtime ?? ""}</td>
                        <td className="px-2 py-1">
                          <button className="text-xs text-primary" onClick={() => openEdit(e.path)}>{t("storage.edit")}</button>
                          <span className="mx-2">•</span>
                          <a className="text-xs text-primary" href={downloadVolumePath(ns, pvc, e.path)} target="_blank" rel="noreferrer">{t("storage.download")}</a>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-primary" onClick={() => doRename(e.path)}>{t("storage.rename")}</button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Editor */}
      <Modal
        open={!!editPath}
        onClose={() => setEditPath(null)}
        title={t("storage.edit")}
        className="max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setEditPath(null)}>{t("actions.cancel")}</button>
            <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={saveEdit}>{t("storage.save")}</button>
          </div>
        }
      >
        <textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="h-80 w-full rounded-md border border-border bg-surface p-2 font-mono text-sm" />
      </Modal>
    </Modal>
  );
}

export default function StoragePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: classes } = useQuery({ queryKey: queryKeys.storageClasses, queryFn: fetchStorageClasses });
  const { data: pvcs } = useQuery({ queryKey: queryKeys.pvcs(), queryFn: () => fetchPvcs() });

  const [creating, setCreating] = useState(false);
  const [browser, setBrowser] = useState<{ ns: string; pvc: string } | null>(null);

  const createMut = useMutation({
    mutationFn: createStorageClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.storageClasses }),
  });
  const deleteMut = useMutation({
    mutationFn: deleteStorageClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.storageClasses }),
  });

  const onCreate = async (p: StorageClassCreatePayload) => {
    await createMut.mutateAsync(p);
    setCreating(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("storage.eyebrow")}
        title={t("storage.title")}
        description={t("storage.desc")}
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("storage.meta.sc")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{classes?.length ?? 0}</p>
              <p className="text-xs text-text-muted">{t("storage.meta.sc.desc")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("storage.meta.pvc")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{pvcs?.length ?? 0}</p>
              <p className="text-xs text-text-muted">{t("storage.meta.pvc.desc")}</p>
            </div>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-text-primary">{t("storage.manage")}</CardTitle>
          <CardDescription>{t("storage.manage.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="classes">
            <TabsList>
              <TabsTrigger value="classes">{t("storage.tab.classes")}</TabsTrigger>
              <TabsTrigger value="volumes">{t("storage.tab.volumes")}</TabsTrigger>
            </TabsList>
            <TabsContent value="classes" className="pt-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm text-text-muted">{t("storage.sc.desc")}</div>
                <button className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={() => setCreating(true)}>{t("storage.sc.new")}</button>
              </div>
              <div className="overflow-auto border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-text-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">{t("storage.sc.name")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.sc.provisioner")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.sc.reclaim")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.sc.binding")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.sc.expand")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!classes || classes.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-text-muted" colSpan={6}>{t("storage.sc.empty")}</td>
                      </tr>
                    ) : (
                      classes.map((sc: StorageClassSummaryResponse) => (
                        <tr key={sc.name} className="hover:bg-muted/50">
                          <td className="px-2 py-1 font-medium">{sc.name}</td>
                          <td className="px-2 py-1">{sc.provisioner ?? ""}</td>
                          <td className="px-2 py-1">{sc.reclaim_policy ?? ""}</td>
                          <td className="px-2 py-1">{sc.volume_binding_mode ?? ""}</td>
                          <td className="px-2 py-1">{String(Boolean(sc.allow_volume_expansion))}</td>
                          <td className="px-2 py-1">
                            <button className="text-xs text-error" onClick={() => deleteMut.mutate(sc.name)}>{t("storage.delete")}</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="volumes" className="pt-2">
              <div className="text-sm text-text-muted mb-2">{t("storage.pvc.desc")}</div>
              <div className="overflow-auto border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-text-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">{t("workloadTable.th.namespace")}</th>
                      <th className="px-2 py-1 text-left">{t("workloadTable.th.name")}</th>
                      <th className="px-2 py-1 text-left">{t("status.status") ?? "Status"}</th>
                      <th className="px-2 py-1 text-left">SC</th>
                      <th className="px-2 py-1 text-left">{t("storage.size")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.accessModes")}</th>
                      <th className="px-2 py-1 text-left">{t("storage.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!pvcs || pvcs.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-text-muted" colSpan={7}>{t("storage.pvc.empty")}</td>
                      </tr>
                    ) : (
                      pvcs.map((p: PersistentVolumeClaimSummaryResponse) => (
                        <tr key={`${p.namespace}/${p.name}`} className="hover:bg-muted/50">
                          <td className="px-2 py-1">{p.namespace}</td>
                          <td className="px-2 py-1 font-medium">{p.name}</td>
                          <td className="px-2 py-1">{p.status ?? ""}</td>
                          <td className="px-2 py-1">{p.storage_class ?? ""}</td>
                          <td className="px-2 py-1">{p.capacity ?? ""}</td>
                          <td className="px-2 py-1">{(p.access_modes ?? []).join(", ")}</td>
                          <td className="px-2 py-1">
                            <button className="text-xs text-primary" onClick={() => setBrowser({ ns: p.namespace, pvc: p.name })}>{t("storage.browse")}</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={t("storage.sc.new")}>{
        <CreateStorageClassForm onSubmit={onCreate} onCancel={() => setCreating(false)} />
      }</Modal>
      {browser && <VolumeBrowser ns={browser.ns} pvc={browser.pvc} onClose={() => setBrowser(null)} />}
    </div>
  );
}

