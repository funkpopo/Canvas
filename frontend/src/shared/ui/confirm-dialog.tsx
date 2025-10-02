"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: any; // e.g., "destructive" | "default"
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  // Optional double-confirm step
  doubleConfirm?: boolean;
  secondTitle?: React.ReactNode;
  secondDescription?: React.ReactNode;
  secondConfirmText?: string;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmVariant = "default",
    onConfirm,
    loading = false,
    doubleConfirm = false,
    secondTitle,
    secondDescription,
    secondConfirmText,
  } = props;

  const [phase, setPhase] = useState<1 | 2>(1);

  useEffect(() => {
    if (!open) setPhase(1);
  }, [open]);

  const currentTitle = useMemo(() => (phase === 1 ? title : (secondTitle ?? title)), [phase, title, secondTitle]);
  const currentDesc = useMemo(() => (phase === 1 ? description : (secondDescription ?? description)), [phase, description, secondDescription]);
  const currentConfirmText = useMemo(
    () => (phase === 1 ? confirmText : (secondConfirmText ?? confirmText)),
    [phase, confirmText, secondConfirmText]
  );

  if (!open) return null;

  const handleBackdrop = () => {
    if (!loading) onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (doubleConfirm && phase === 1) {
      setPhase(2);
      return;
    }
    await onConfirm();
  };

  return ReactDOM.createPortal(
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-50">
      <div
        className={cn("absolute inset-0 bg-black/50", loading && "cursor-wait")}
        onClick={handleBackdrop}
      />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface text-text-primary shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold">{currentTitle}</h2>
          </div>
          {currentDesc && (
            <div className="px-4 py-3 text-sm text-text-muted">
              {currentDesc}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? `${currentConfirmText}` : currentConfirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmDialog;
