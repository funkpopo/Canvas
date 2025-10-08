"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets, Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import {
  createStorageClass,
  deleteStorageClass,
  downloadVolumePath,
  fetchPvcs,
  fetchStorageClasses,
  fetchNamespaces,
  fetchVolumeList,
  queryKeys,
  readVolumeFile,
  renameVolumePath,
  writeVolumeFile,
  createVolumeDir,
  deleteVolumePath,
  downloadVolumeZip,
  expandPvc,
  type PersistentVolumeClaimSummaryResponse,
  type StorageClassCreatePayload,
  type StorageClassSummaryResponse,
  type VolumeFileEntryResponse,
} from "@/lib/api";
import { Modal } from "@/shared/ui/modal";
import { SnapshotsTab } from "./_components/SnapshotsTab";
import { StatisticsTab } from "./_components/StatisticsTab";
import { StorageClassDetailModal } from "./_components/StorageClassDetailModal";
import { ClonePvcModal } from "./_components/ClonePvcModal";
import { CreateSnapshotModal } from "./_components/CreateSnapshotModal";
import { FilePreviewModal } from "./_components/FilePreviewModal";

function CreateStorageClassForm({ onSubmit, onCancel }: { onSubmit: (p: StorageClassCreatePayload) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [prov, setProv] = useState("");
  const [allowExp, setAllowExp] = useState(true);
  const [ns, setNs] = useState<string>("");
  const [scType, setScType] = useState<"Generic" | "NFS">("Generic");
  const [reclaim, setReclaim] = useState<string>("Delete");
  const [binding, setBinding] = useState<string>("Immediate");
  const [mountOpt, setMountOpt] = useState<string>("");
  const [imageSource, setImageSource] = useState<"public" | "private">("public");
  const [privateImage, setPrivateImage] = useState<string>("");
  const [nfsServer, setNfsServer] = useState<string>("");
  const [nfsPath, setNfsPath] = useState<string>("");
  const [nfsCapacity, setNfsCapacity] = useState<string>("");

  const { data: namespaces } = useQuery({ queryKey: queryKeys.namespaces, queryFn: fetchNamespaces });

  useEffect(() => {
    if (!ns && namespaces && namespaces.length > 0) {
      const def = namespaces.find((n) => n.name === "default")?.name || namespaces[0].name;
      setNs(def);
    }
  }, [namespaces, ns]);

  const computedProv = useMemo(() => {
    if (scType === "NFS") return `${ns || "default"}.nfs-client-provisioner`;
    return prov;
  }, [scType, ns, prov]);
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-text-muted mb-1">{t("storage.sc.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="fast-sc" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">{t("storage.sc.namespace")}</label>
        <select value={ns} onChange={(e) => setNs(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
          {(namespaces ?? []).map((n) => (
            <option key={n.name} value={n.name}>{n.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">{t("storage.sc.type")}</label>
        <select value={scType} onChange={(e) => setScType(e.target.value as any)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
          <option value="Generic">{t("storage.sc.type.generic")}</option>
          <option value="NFS">{t("storage.sc.type.nfs")}</option>
        </select>
      </div>
      {scType === "Generic" ? (
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.sc.provisioner")}</label>
          <input value={prov} onChange={(e) => setProv(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="kubernetes.io/no-provisioner" />
        </div>
      ) : (
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.sc.provisioner")}</label>
          <input value={computedProv} readOnly className="w-full rounded-md border border-border bg-muted px-2 py-1 text-sm" />
        </div>
      )}

      {scType === "NFS" && (
        <>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.sc.imageSource")}</label>
            <select value={imageSource} onChange={(e) => setImageSource(e.target.value as any)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
              <option value="public">{t("storage.sc.image.publicLabel")}</option>
              <option value="private">{t("storage.sc.image.privateLabel")}</option>
            </select>
            <div className="text-xs text-text-muted mt-1">
              {imageSource === "public" ? "eipwork/nfs-client-provisioner:latest" : t("storage.sc.image.privateHint")}
            </div>
          </div>
          {imageSource === "private" && (
            <div>
              <label className="block text-sm text-text-muted mb-1">{t("storage.sc.privateImage")}</label>
              <input value={privateImage} onChange={(e) => setPrivateImage(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="registry.example.com/nfs-client-provisioner:tag" />
            </div>
          )}
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.sc.nfs.server")}</label>
            <input value={nfsServer} onChange={(e) => setNfsServer(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="10.0.0.10" />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.sc.nfs.path")}</label>
            <input value={nfsPath} onChange={(e) => setNfsPath(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="/export/k8s" />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.sc.nfs.capacity")}</label>
            <input value={nfsCapacity} onChange={(e) => setNfsCapacity(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="e.g. 100Gi" />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.sc.mountOptions")}</label>
            <input value={mountOpt} onChange={(e) => setMountOpt(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" placeholder="nolock,vers=4.1" />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.sc.reclaim")}</label>
          <select value={reclaim} onChange={(e) => setReclaim(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
            <option value="Delete">Delete</option>
            <option value="Retain">Retain</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.sc.binding")}</label>
          <select value={binding} onChange={(e) => setBinding(e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
            <option value="Immediate">Immediate</option>
            <option value="WaitForFirstConsumer">WaitForFirstConsumer</option>
          </select>
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowExp} onChange={(e) => setAllowExp(e.target.checked)} />
        {t("storage.sc.allowExpansion")}
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={onCancel}>{t("actions.cancel")}</button>
        <button
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm"
          onClick={() => {
            const base = {
              name,
              provisioner: computedProv,
              allow_volume_expansion: allowExp,
              reclaim_policy: reclaim || null,
              volume_binding_mode: binding || null,
              parameters: {},
              sc_type: scType,
              namespace: ns,
              mount_options: (mountOpt || "").split(",").map((s) => s.trim()).filter(Boolean),
            } as StorageClassCreatePayload;
            if (scType === "NFS") {
              base.nfs_server = nfsServer;
              base.nfs_path = nfsPath;
              base.nfs_capacity = nfsCapacity || null;
              base.image_source = imageSource;
              base.private_image = imageSource === "private" ? privateImage : null;
            }
            onSubmit(base);
          }}
          disabled={!name || (scType === "Generic" ? !prov : !(ns && nfsServer && nfsPath))}
        >
          {t("storage.sc.create")}
        </button>
      </div>
    </div>
  );
}

function VolumeBrowser({ ns, pvc, onClose }: { ns: string; pvc: string; onClose: () => void }) {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const [path, setPath] = useState<string>("/");
  const [editPath, setEditPath] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewPath, setPreviewPath] = useState<string | null>(null);
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

  const toggleSelect = (p: string) => {
    setSelected((prev) => ({ ...prev, [p]: !prev[p] }));
  };

  const selectedPaths = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const newDir = async () => {
    const name = prompt(t("storage.browser.newDir"));
    if (!name) return;
    const full = path.endsWith("/") ? `${path}${name}` : `${path}/${name}`;
    await createVolumeDir(ns, pvc, full);
    reload();
  };

  const deleteSelected = async () => {
    const confirmed = await confirm({
      title: t("storage.browser.deleteSelected"),
      description: `${selectedPaths.length} items will be deleted`,
    });
    if (!confirmed) return;
    for (const p of selectedPaths) {
      await deleteVolumePath(ns, pvc, p, true);
    }
    setSelected({});
    reload();
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
            <div className="flex items-center gap-2">
              <button className="text-xs text-primary" onClick={newDir}>{t("storage.browser.newDir")}</button>
              <a className="text-xs text-primary" href={downloadVolumeZip(ns, pvc, selectedPaths)} target="_blank" rel="noreferrer">{t("storage.browser.downloadSelected")}</a>
              <button className="text-xs text-error" onClick={deleteSelected}>{t("storage.browser.deleteSelected")}</button>
            </div>
          </div>
          <div className="overflow-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted text-text-muted">
                <tr>
                  <th className="px-2 py-1 text-left">
                    <input
                      type="checkbox"
                      checked={selectedPaths.length > 0 && selectedPaths.length === (list?.length ?? 0)}
                      onChange={(e) => {
                        const all: Record<string, boolean> = {};
                        if (e.target.checked) {
                          (list ?? []).forEach((it) => (all[it.path] = true));
                        }
                        setSelected(all);
                      }}
                    />
                  </th>
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
                    <td className="px-2 py-2 text-text-muted" colSpan={6}>{t("storage.browser.empty")}</td>
                  </tr>
                ) : (
                  <>
                    {dirs.map((e) => (
                      <tr key={e.path} className="hover:bg-muted/50">
                        <td className="px-2 py-1"><input type="checkbox" checked={!!selected[e.path]} onChange={() => toggleSelect(e.path)} /></td>
                        <td className="px-2 py-1 font-medium">📁 {e.name}</td>
                        <td className="px-2 py-1">{e.permissions ?? ""}</td>
                        <td className="px-2 py-1">-</td>
                        <td className="px-2 py-1">{e.mtime ?? ""}</td>
                        <td className="px-2 py-1">
                          <button className="text-xs text-primary" onClick={() => setPath(e.path)}>{t("storage.browser.open")}</button>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-primary" onClick={() => doRename(e.path)}>{t("storage.rename")}</button>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-error" onClick={async () => {
                            const confirmed = await confirm({ title: `${t("storage.delete")} ${e.name}?` });
                            if (confirmed) await deleteVolumePath(ns, pvc, e.path, true).then(reload);
                          }}>{t("storage.delete")}</button>
                        </td>
                      </tr>
                    ))}
                    {files.map((e) => (
                      <tr key={e.path} className="hover:bg-muted/50">
                        <td className="px-2 py-1"><input type="checkbox" checked={!!selected[e.path]} onChange={() => toggleSelect(e.path)} /></td>
                        <td className="px-2 py-1">📄 {e.name}</td>
                        <td className="px-2 py-1">{e.permissions ?? ""}</td>
                        <td className="px-2 py-1">{e.size ?? ""}</td>
                        <td className="px-2 py-1">{e.mtime ?? ""}</td>
                        <td className="px-2 py-1">
                          <button className="text-xs text-primary" onClick={() => setPreviewPath(e.path)}>{t("storage.preview.text")}</button>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-primary" onClick={() => openEdit(e.path)}>{t("storage.edit")}</button>
                          <span className="mx-2">•</span>
                          <a className="text-xs text-primary" href={downloadVolumePath(ns, pvc, e.path)} target="_blank" rel="noreferrer">{t("storage.download")}</a>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-primary" onClick={() => doRename(e.path)}>{t("storage.rename")}</button>
                          <span className="mx-2">•</span>
                          <button className="text-xs text-error" onClick={async () => {
                            const confirmed = await confirm({ title: `${t("storage.delete")} ${e.name}?` });
                            if (confirmed) await deleteVolumePath(ns, pvc, e.path, false).then(reload);
                          }}>{t("storage.delete")}</button>
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

      {/* File Preview */}
      <FilePreviewModal
        namespace={ns}
        pvc={pvc}
        path={previewPath}
        onClose={() => setPreviewPath(null)}
      />

      <ConfirmDialogComponent />
    </Modal>
  );
}

export default function StoragePage() {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const queryClient = useQueryClient();
  const { data: classes } = useQuery({ queryKey: queryKeys.storageClasses, queryFn: fetchStorageClasses });
  const { data: pvcs } = useQuery({ queryKey: queryKeys.pvcs(), queryFn: () => fetchPvcs() });

  const [creating, setCreating] = useState(false);
  const [browser, setBrowser] = useState<{ ns: string; pvc: string } | null>(null);
  const [scDetailName, setScDetailName] = useState<string | null>(null);
  const [clonePvcOpen, setClonePvcOpen] = useState(false);
  const [clonePvcInitial, setClonePvcInitial] = useState<{ ns?: string; pvc?: string }>({});
  const [createSnapshotOpen, setCreateSnapshotOpen] = useState(false);

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
              <TabsTrigger value="snapshots">{t("storage.tab.snapshots")}</TabsTrigger>
              <TabsTrigger value="statistics">{t("storage.stats.title")}</TabsTrigger>
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
                            <button className="text-xs text-primary" onClick={() => setScDetailName(sc.name)}>{t("pods.detail")}</button>
                            <span className="mx-2">•</span>
                            <button className="text-xs text-error" onClick={async () => {
                              const confirmed = await confirm({ title: `${t("storage.delete")} ${sc.name}?` });
                              if (confirmed) deleteMut.mutate(sc.name);
                            }}>{t("storage.delete")}</button>
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
                            <span className="mx-2">•</span>
                            <button className="text-xs text-primary" onClick={() => {
                              setClonePvcInitial({ ns: p.namespace, pvc: p.name });
                              setClonePvcOpen(true);
                            }}>{t("storage.clone.button")}</button>
                            <span className="mx-2">•</span>
                            <button className="text-xs text-primary" onClick={async () => {
                              const size = prompt(t("storage.expand.prompt"));
                              if (!size) return;
                              await expandPvc(p.namespace, p.name, size);
                              queryClient.invalidateQueries({ queryKey: queryKeys.pvcs() });
                            }}>{t("storage.expand")}</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="snapshots">
              <SnapshotsTab onCreateSnapshot={() => setCreateSnapshotOpen(true)} />
            </TabsContent>

            <TabsContent value="statistics">
              <StatisticsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={t("storage.sc.new")}>{
        <CreateStorageClassForm onSubmit={onCreate} onCancel={() => setCreating(false)} />
      }</Modal>
      
      {browser && <VolumeBrowser ns={browser.ns} pvc={browser.pvc} onClose={() => setBrowser(null)} />}
      
      <StorageClassDetailModal
        name={scDetailName}
        onClose={() => setScDetailName(null)}
      />
      
      <ClonePvcModal
        open={clonePvcOpen}
        onClose={() => {
          setClonePvcOpen(false);
          setClonePvcInitial({});
        }}
        initialNamespace={clonePvcInitial.ns}
        initialPvc={clonePvcInitial.pvc}
      />
      
      <CreateSnapshotModal
        open={createSnapshotOpen}
        onClose={() => setCreateSnapshotOpen(false)}
      />
      
      <ConfirmDialogComponent />
    </div>
  );
}
