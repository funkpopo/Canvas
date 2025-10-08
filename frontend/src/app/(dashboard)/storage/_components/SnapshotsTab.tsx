"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import {
  fetchVolumeSnapshots,
  deleteVolumeSnapshot,
  restoreFromSnapshot,
  fetchNamespaces,
  queryKeys,
  type VolumeSnapshotSummaryResponse,
} from "@/lib/api";
import { Badge } from "@/shared/ui/badge";

interface SnapshotsTabProps {
  onCreateSnapshot: () => void;
}

export function SnapshotsTab({ onCreateSnapshot }: SnapshotsTabProps) {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const queryClient = useQueryClient();
  const [filterNs, setFilterNs] = useState<string>("all");

  const { data: namespaces } = useQuery({
    queryKey: queryKeys.namespaces,
    queryFn: fetchNamespaces,
  });

  const { data: snapshots, isLoading } = useQuery({
    queryKey: queryKeys.volumeSnapshots(filterNs === "all" ? undefined : filterNs),
    queryFn: () => fetchVolumeSnapshots(filterNs === "all" ? undefined : filterNs),
  });

  const deleteMut = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteVolumeSnapshot(namespace, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volumeSnapshots() });
    },
  });

  const restoreMut = useMutation({
    mutationFn: ({
      namespace,
      snapshotName,
      pvcName,
    }: {
      namespace: string;
      snapshotName: string;
      pvcName: string;
    }) => restoreFromSnapshot(namespace, snapshotName, pvcName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pvcs() });
    },
  });

  const handleDelete = async (namespace: string, name: string) => {
    const confirmed = await confirm({
      title: `${t("storage.snapshot.delete")} ${name}?`,
      description: t("actions.continue"),
    });
    if (confirmed) {
      deleteMut.mutate({ namespace, name });
    }
  };

  const handleRestore = async (namespace: string, snapshotName: string) => {
    const pvcName = prompt(`${t("storage.snapshot.restore")} - ${t("storage.clone.targetName")}`);
    if (!pvcName) return;
    restoreMut.mutate({ namespace, snapshotName, pvcName });
  };

  const getStatusBadge = (snapshot: VolumeSnapshotSummaryResponse) => {
    if (snapshot.ready_to_use) {
      return <Badge variant="success">{t("storage.snapshot.ready")}</Badge>;
    }
    return <Badge variant="warning">{t("storage.snapshot.pending")}</Badge>;
  };

  return (
    <div className="pt-2">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-muted">{t("pods.filter.namespace")}:</label>
          <select
            value={filterNs}
            onChange={(e) => setFilterNs(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
          >
            <option value="all">{t("pods.filter.all")}</option>
            {(namespaces ?? []).map((ns) => (
              <option key={ns.name} value={ns.name}>
                {ns.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm"
          onClick={onCreateSnapshot}
        >
          {t("storage.snapshot.create")}
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-muted py-4">{t("common.loading")}</div>
      ) : (
        <div className="overflow-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted text-text-muted">
              <tr>
                <th className="px-2 py-1 text-left">{t("workloadTable.th.namespace")}</th>
                <th className="px-2 py-1 text-left">{t("storage.snapshot.name")}</th>
                <th className="px-2 py-1 text-left">{t("storage.snapshot.source")}</th>
                <th className="px-2 py-1 text-left">{t("storage.snapshot.class")}</th>
                <th className="px-2 py-1 text-left">{t("storage.snapshot.status")}</th>
                <th className="px-2 py-1 text-left">{t("storage.snapshot.size")}</th>
                <th className="px-2 py-1 text-left">{t("storage.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {!snapshots || snapshots.length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-text-muted" colSpan={7}>
                    {t("storage.snapshot.empty")}
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => (
                  <tr key={`${snap.namespace}/${snap.name}`} className="hover:bg-muted/50">
                    <td className="px-2 py-1">{snap.namespace}</td>
                    <td className="px-2 py-1 font-medium">{snap.name}</td>
                    <td className="px-2 py-1">{snap.source_pvc ?? "-"}</td>
                    <td className="px-2 py-1">{snap.snapshot_class ?? "-"}</td>
                    <td className="px-2 py-1">{getStatusBadge(snap)}</td>
                    <td className="px-2 py-1">{snap.restore_size ?? "-"}</td>
                    <td className="px-2 py-1">
                      <button
                        className="text-xs text-primary disabled:opacity-50"
                        onClick={() => handleRestore(snap.namespace, snap.name)}
                        disabled={!snap.ready_to_use}
                      >
                        {t("storage.snapshot.restore")}
                      </button>
                      <span className="mx-2">•</span>
                      <button
                        className="text-xs text-error"
                        onClick={() => handleDelete(snap.namespace, snap.name)}
                      >
                        {t("storage.snapshot.delete")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
