"use client";

import React, { useState, useRef } from "react";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: any;
  doubleConfirm?: boolean;
  secondTitle?: React.ReactNode;
  secondDescription?: React.ReactNode;
  secondConfirmText?: string;
};

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  };

  const handleConfirm = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    setLoading(false);
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  };

  const ConfirmDialogComponent = () => {
    if (!options) return null;

    return (
      <ConfirmDialog
        open={isOpen}
        onOpenChange={(open: boolean) => {
          if (!open) handleCancel();
        }}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        confirmVariant={options.confirmVariant || "destructive"}
        onConfirm={handleConfirm}
        loading={loading}
        doubleConfirm={options.doubleConfirm}
        secondTitle={options.secondTitle}
        secondDescription={options.secondDescription}
        secondConfirmText={options.secondConfirmText}
      />
    );
  };

  return { confirm, ConfirmDialogComponent };
}
