"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n/i18n";
import { Modal } from "@/shared/ui/modal";
import {
  clonePvc,
  fetchNamespaces,
  fetchPvcs,
  fetchVolumeSnapshots,
  queryKeys,
  type PvcCloneRequestPayload,
} from "@/lib/api";

interface ClonePvcModalProps {
  open: boolean;
  onClose: () => void;
  initialNamespace?: string;
  initialPvc?: string;
}

export function ClonePvcModal({ open, onClose, initialNamespace, initialPvc }: ClonePvcModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  
  const [cloneType, setCloneType] = useState<"pvc" | "snapshot">("pvc");
  const [sourceNs, setSourceNs] = useState<string>("");
  const [sourcePvc, setSourcePvc] = useState<string>("");
  const [sourceSnapshot, setSourceSnapshot] = useState<string>("");
  const [targetNs, setTargetNs] = useState<string>("");
  const [targetName, setTargetName] = useState<string>("");
  const [storageClass, setStorageClass] = useState<string>("");
  const [size, setSize] = useState<string>("");
  
  const { data: namespaces } = useQuery({
    queryKey: queryKeys.namespaces,
    queryFn: fetchNamespaces,
  });

  const { data: pvcs } = useQuery({
    queryKey: queryKeys.pvcs(sourceNs || undefined),
    queryFn: () => fetchPvcs(sourceNs || undefined),
    enabled: cloneType === "pvc" && !!sourceNs,
  });

  const { data: snapshots } = useQuery({
    queryKey: queryKeys.volumeSnapshots(sourceNs || undefined),
    queryFn: () => fetchVolumeSnapshots(sourceNs || undefined),
    enabled: cloneType === "snapshot" && !!sourceNs,
  });

  useEffect(() => {
    if (initialNamespace) setSourceNs(initialNamespace);
    if (initialPvc) setSourcePvc(initialPvc);
  }, [initialNamespace, initialPvc]);

  useEffect(() => {
    if (namespaces && namespaces.length > 0 && !sourceNs) {
      setSourceNs(namespaces[0].name);
    }
    if (namespaces && namespaces.length > 0 && !targetNs) {
      setTargetNs(namespaces[0].name);
    }
  }, [namespaces, sourceNs, targetNs]);

  const cloneMut = useMutation({
    mutationFn: clonePvc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pvcs() });
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setCloneType("pvc");
    setSourcePvc("");
    setSourceSnapshot("");
    setTargetName("");
    setStorageClass("");
    setSize("");
  };

  const handleSubmit = () => {
    const payload: PvcCloneRequestPayload = {
      source_namespace: sourceNs,
      target_namespace: targetNs,
      target_name: targetName,
      storage_class: storageClass || null,
      size: size || null,
    };

    if (cloneType === "pvc") {
      payload.source_pvc = sourcePvc;
    } else {
      payload.source_snapshot = sourceSnapshot;
    }

    cloneMut.mutate(payload);
  };

  const isValid = targetName && ((cloneType === "pvc" && sourcePvc) || (cloneType === "snapshot" && sourceSnapshot));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("storage.clone.title")}
      className="max-w-2xl"
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
            disabled={!isValid || cloneMut.isPending}
          >
            {cloneMut.isPending ? t("common.loading") : t("storage.clone.button")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Clone Type */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.clone.source")}</label>
          <select
            value={cloneType}
            onChange={(e) => setCloneType(e.target.value as "pvc" | "snapshot")}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            <option value="pvc">{t("storage.clone.fromPvc")}</option>
            <option value="snapshot">{t("storage.clone.fromSnapshot")}</option>
          </select>
        </div>

        {/* Source Namespace */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("workloadTable.th.namespace")}</label>
          <select
            value={sourceNs}
            onChange={(e) => setSourceNs(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            {(namespaces ?? []).map((ns) => (
              <option key={ns.name} value={ns.name}>
                {ns.name}
              </option>
            ))}
          </select>
        </div>

        {/* Source PVC or Snapshot */}
        {cloneType === "pvc" ? (
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.clone.fromPvc")}</label>
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
        ) : (
          <div>
            <label className="block text-sm text-text-muted mb-1">{t("storage.clone.fromSnapshot")}</label>
            <select
              value={sourceSnapshot}
              onChange={(e) => setSourceSnapshot(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              <option value="">-- {t("pods.filter.select")} --</option>
              {(snapshots ?? []).filter(s => s.ready_to_use).map((snap) => (
                <option key={snap.name} value={snap.name}>
                  {snap.name} ({snap.restore_size})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Target Namespace */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.clone.targetNs")}</label>
          <select
            value={targetNs}
            onChange={(e) => setTargetNs(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            {(namespaces ?? []).map((ns) => (
              <option key={ns.name} value={ns.name}>
                {ns.name}
              </option>
            ))}
          </select>
        </div>

        {/* Target Name */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.clone.targetName")}</label>
          <input
            type="text"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            placeholder="new-pvc-name"
          />
        </div>

        {/* Optional: Storage Class */}
        <div>
          <label className="block text-sm text-text-muted mb-1">StorageClass ({t("pods.filter.optional")})</label>
          <input
            type="text"
            value={storageClass}
            onChange={(e) => setStorageClass(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            placeholder={t("pods.filter.leaveEmpty")}
          />
        </div>

        {/* Optional: Size */}
        <div>
          <label className="block text-sm text-text-muted mb-1">{t("storage.size")} ({t("pods.filter.optional")})</label>
          <input
            type="text"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            placeholder="e.g., 10Gi"
          />
        </div>
      </div>
    </Modal>
  );
}
