"use client";

import { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`w-full py-8 text-center ${className ?? ""}`}>
      <div className="text-sm font-medium text-text-primary">{title}</div>
      {description && <div className="mt-1 text-xs text-text-muted">{description}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

