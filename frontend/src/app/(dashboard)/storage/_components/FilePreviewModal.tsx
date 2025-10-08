"use client";

import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n/i18n";
import { Modal } from "@/shared/ui/modal";
import { fetchFilePreview } from "@/lib/api";

interface FilePreviewModalProps {
  namespace: string | null;
  pvc: string | null;
  path: string | null;
  onClose: () => void;
}

export function FilePreviewModal({ namespace, pvc, path, onClose }: FilePreviewModalProps) {
  const { t } = useI18n();

  const { data: preview, isLoading } = useQuery({
    queryKey: ["filePreview", namespace, pvc, path],
    queryFn: () => {
      if (!namespace || !pvc || !path) return null;
      return fetchFilePreview(namespace, pvc, path);
    },
    enabled: !!(namespace && pvc && path),
  });

  if (!namespace || !pvc || !path) return null;

  const fileName = path.split("/").pop() || "file";

  return (
    <Modal
      open={!!(namespace && pvc && path)}
      onClose={onClose}
      title={`${t("storage.preview.text")} - ${fileName}`}
      className="max-w-4xl"
    >
      {isLoading ? (
        <div className="py-4 text-text-muted">{t("common.loading")}</div>
      ) : !preview ? (
        <div className="py-4 text-text-muted">{t("storage.preview.notAvailable")}</div>
      ) : !preview.preview_available ? (
        <div className="py-4 text-text-muted">
          {preview.error_message || t("storage.preview.notAvailable")}
        </div>
      ) : preview.is_text ? (
        <div>
          <div className="text-xs text-text-muted mb-2">
            {preview.mime_type} • {preview.size ? `${preview.size} bytes` : ""} • {preview.encoding}
          </div>
          <pre className="bg-muted/30 p-4 rounded-md overflow-auto max-h-[600px] text-xs font-mono whitespace-pre-wrap">
            {preview.content || t("storage.preview.notAvailable")}
          </pre>
        </div>
      ) : preview.is_image ? (
        <div>
          <div className="text-xs text-text-muted mb-2">
            {preview.mime_type} • {preview.size ? `${preview.size} bytes` : ""}
          </div>
          <div className="flex justify-center bg-muted/30 p-4 rounded-md">
            <img
              src={`data:${preview.mime_type};base64,${preview.content}`}
              alt={fileName}
              className="max-w-full max-h-[600px] object-contain"
            />
          </div>
        </div>
      ) : (
        <div className="py-4 text-text-muted">{t("storage.preview.notAvailable")}</div>
      )}
    </Modal>
  );
}
