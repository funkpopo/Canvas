"use client";

import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n/i18n";
import { Modal } from "@/shared/ui/modal";
import { fetchStorageClassDetail, queryKeys } from "@/lib/api";

interface StorageClassDetailModalProps {
  name: string | null;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function StorageClassDetailModal({ name, onClose }: StorageClassDetailModalProps) {
  const { t } = useI18n();

  const { data: detail, isLoading } = useQuery({
    queryKey: queryKeys.storageClassDetail(name ?? ""),
    queryFn: () => (name ? fetchStorageClassDetail(name) : null),
    enabled: !!name,
  });

  if (!name) return null;

  return (
    <Modal open={!!name} onClose={onClose} title={`${t("storage.class.detail.title")} - ${name}`} className="max-w-4xl">
      {isLoading ? (
        <div className="py-4 text-text-muted">{t("common.loading")}</div>
      ) : !detail ? (
        <div className="py-4 text-text-muted">{t("common.unknown")}</div>
      ) : (
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-md">
            <div>
              <div className="text-xs text-text-muted">{t("storage.sc.provisioner")}</div>
              <div className="text-sm font-medium text-text-primary">{detail.provisioner ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">{t("storage.sc.reclaim")}</div>
              <div className="text-sm font-medium text-text-primary">{detail.reclaim_policy ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">{t("storage.sc.binding")}</div>
              <div className="text-sm font-medium text-text-primary">{detail.volume_binding_mode ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">{t("storage.sc.allowExpansion")}</div>
              <div className="text-sm font-medium text-text-primary">{String(Boolean(detail.allow_volume_expansion))}</div>
            </div>
          </div>

          {/* Capacity Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 border border-border rounded-md">
              <div className="text-xs text-text-muted">{t("storage.class.detail.pvcCount")}</div>
              <div className="text-2xl font-bold text-text-primary mt-1">{detail.pvc_count}</div>
            </div>
            <div className="p-3 border border-border rounded-md">
              <div className="text-xs text-text-muted">{t("storage.class.detail.capacity")}</div>
              <div className="text-2xl font-bold text-text-primary mt-1">{formatBytes(detail.total_capacity_bytes)}</div>
            </div>
            <div className="p-3 border border-border rounded-md">
              <div className="text-xs text-text-muted">{t("storage.stats.usedCapacity")}</div>
              <div className="text-2xl font-bold text-text-primary mt-1">{formatBytes(detail.used_capacity_bytes)}</div>
            </div>
          </div>

          {/* Mount Options */}
          {detail.mount_options && detail.mount_options.length > 0 && (
            <div>
              <div className="text-sm font-medium text-text-primary mb-2">{t("storage.sc.mountOptions")}</div>
              <div className="text-xs text-text-muted font-mono bg-muted/30 p-2 rounded">
                {detail.mount_options.join(", ")}
              </div>
            </div>
          )}

          {/* Parameters */}
          {Object.keys(detail.parameters).length > 0 && (
            <div>
              <div className="text-sm font-medium text-text-primary mb-2">Parameters</div>
              <div className="text-xs text-text-muted font-mono bg-muted/30 p-2 rounded space-y-1">
                {Object.entries(detail.parameters).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-primary">{key}</span>: {value}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Associated PVCs */}
          <div>
            <div className="text-sm font-medium text-text-primary mb-2">
              {t("storage.meta.pvc")} ({detail.pvcs.length})
            </div>
            <div className="overflow-auto border border-border rounded-md max-h-80">
              <table className="w-full text-sm">
                <thead className="bg-muted text-text-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">{t("workloadTable.th.namespace")}</th>
                    <th className="px-2 py-1 text-left">{t("workloadTable.th.name")}</th>
                    <th className="px-2 py-1 text-left">{t("status.status")}</th>
                    <th className="px-2 py-1 text-left">{t("storage.size")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.pvcs.length === 0 ? (
                    <tr>
                      <td className="px-2 py-2 text-text-muted" colSpan={4}>
                        {t("storage.pvc.empty")}
                      </td>
                    </tr>
                  ) : (
                    detail.pvcs.map((pvc) => (
                      <tr key={`${pvc.namespace}/${pvc.name}`} className="hover:bg-muted/50">
                        <td className="px-2 py-1">{pvc.namespace}</td>
                        <td className="px-2 py-1 font-medium">{pvc.name}</td>
                        <td className="px-2 py-1">{pvc.status ?? "-"}</td>
                        <td className="px-2 py-1">{pvc.capacity ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
