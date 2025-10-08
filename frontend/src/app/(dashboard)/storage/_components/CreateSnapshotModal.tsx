"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n/i18n";
import { Modal } from "@/shared/ui/modal";
import {
  createVolumeSnapshot,
  fetchNamespaces,
  fetchPvcs,
  queryKeys,
  type VolumeSnapshotCreatePayload,
} from "@/lib/api";

interface CreateSnapshotModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateSnapshotModal({ open, onClose }: CreateSnapshotModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [namespace, setNamespace] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [sourcePvc, setSourcePvc] = useState<string>("");
  const [snapshotClass, setSnapshotClass] = useState<string>("");

  const { data: namespaces } = useQuery({
    queryKey: queryKeys.namespaces,
    queryFn: fetchNamespaces,
  });

  const { data: pvcs } = useQuery({
    queryKey: queryKeys.pvcs(namespace || undefined),
    queryFn: () => fetchPvcs(namespace || undefined),
    enabled: !!namespace,
  });

  useEffect(() => {
    if (namespaces && namespaces.length > 0 && !namespace) {
      setNamespace(namespaces[0].name);
    }
  }, [namespaces, namespace]);

  const createMut = useMutation({
    mutationFn: createVolumeSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volumeSnapshots() });
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setName("");
    setSourcePvc("");
    setSnapshotClass("");
  };

  const handleSubmit = () => {
    const payload: VolumeSnapshotCreatePayload = {
      namespace,
      name,
      source_pvc: sourcePvc,
      snapshot_class: snapshotClass || null,
    };
    createMut.mutate(payload);
  };

  const isValid = namespace && name && sourcePvc;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("storage.snapshot.create")}
      className="max-w-xl"
      footer={
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border border-border px-3 py-1 text-sm"
            onClick={() => {
              onClose();
              resetForm();
            }}
          >
            {t("actions.cancel")}
          </button>
          <button
            className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!isValid || createMut.isPending}
          >
            {createMut.isPending ? t("common.loading") : t("storage.snapshot.create")}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Namespace */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("workloadTable.th.namespace")}</label>
          <select
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            {(namespaces ?? []).map((ns) => (
              <option key={ns.name} value={ns.name}>
                {ns.name}
              </option>
            ))}
          </select>
        </div>

        {/* Snapshot Name */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.snapshot.name")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            placeholder="my-snapshot"
          />
        </div>

        {/* Source PVC */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.snapshot.source")}</label>
          <select
            value={sourcePvc}
            onChange={(e) => setSourcePvc(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            <option value="">-- {t("pods.filter.select")} --</option>
            {(pvcs ?? []).map((pvc) => (
              <option key={pvc.name} value={pvc.name}>
                {pvc.name} ({pvc.capacity})
              </option>
            ))}
          </select>
        </div>

        {/* Snapshot Class (Optional) */}
        <div>
          <label className="block text-sm text-text-muted mb-1">
            {t("storage.snapshot.class")} ({t("pods.filter.optional")})
          </label>
          <input
            type="text"
            value={snapshotClass}
            onChange={(e) => setSnapshotClass(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            placeholder={t("pods.filter.leaveEmpty")}
          />
        </div>
      </div>
    </Modal>
  );
}
