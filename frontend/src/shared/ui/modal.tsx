"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      aria-modal
      role="dialog"
    >
      <div className={cn("w-full max-w-2xl rounded-lg border border-border bg-surface shadow-lg", className)}>
        {(title || description) && (
          <div className="border-b border-border px-4 py-3">
            {title ? <div className="text-base font-semibold text-text-primary">{title}</div> : null}
            {description ? <div className="text-sm text-text-muted">{description}</div> : null}
          </div>
        )}
        <div className="max-h-[70vh] overflow-auto px-4 py-3">{children}</div>
        {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

