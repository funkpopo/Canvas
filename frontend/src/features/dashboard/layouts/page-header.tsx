import { ReactNode } from "react";
import { badgePresets } from "@/shared/ui/badge";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  children,
}: PageHeaderProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-4">
          <div>
            {eyebrow && (
              <span className={`${badgePresets.label} text-text-muted`}>
                {eyebrow}
              </span>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-text-primary lg:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-text-secondary">{description}</p>
            )}
          </div>
          {children}
        </div>
        <div className="flex shrink-0 items-start gap-6">
          {meta && (
            <div className="grid gap-6 md:grid-cols-3">{meta}</div>
          )}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    </div>
  );
}


