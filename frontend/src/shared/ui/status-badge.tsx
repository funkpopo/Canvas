import { Badge, badgePresets } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "healthy" | "warning" | "critical" | "info" | "running" | "pending" | "failed" | "unknown" | "ready" | "not-ready" | "succeeded" | "terminating";
  label: string;
  size?: "sm" | "default" | "lg";
  showIndicator?: boolean;
  className?: string;
}

const statusConfig = {
  healthy: { 
    variant: "success-light" as const, 
    indicatorClass: "bg-success animate-pulse",
    icon: "●"
  },
  ready: { 
    variant: "success" as const, 
    indicatorClass: "bg-success",
    icon: "●"
  },
  running: { 
    variant: "success" as const, 
    indicatorClass: "bg-success animate-pulse",
    icon: "▶"
  },
  succeeded: { 
    variant: "success-light" as const, 
    indicatorClass: "bg-success",
    icon: "✓"
  },
  warning: { 
    variant: "warning-light" as const, 
    indicatorClass: "bg-warning animate-pulse",
    icon: "⚠"
  },
  pending: { 
    variant: "warning" as const, 
    indicatorClass: "bg-warning animate-pulse",
    icon: "⏳"
  },
  critical: { 
    variant: "destructive" as const, 
    indicatorClass: "bg-error animate-pulse",
    icon: "✕"
  },
  failed: { 
    variant: "destructive" as const, 
    indicatorClass: "bg-error",
    icon: "✕"
  },
  "not-ready": { 
    variant: "error-light" as const, 
    indicatorClass: "bg-error",
    icon: "○"
  },
  terminating: { 
    variant: "warning-light" as const, 
    indicatorClass: "bg-warning animate-pulse",
    icon: "⏹"
  },
  info: { 
    variant: "info-light" as const, 
    indicatorClass: "bg-info",
    icon: "ℹ"
  },
  unknown: { 
    variant: "neutral-light" as const, 
    indicatorClass: "bg-badge-neutral",
    icon: "?"
  },
} as const;

export function StatusBadge({ 
  status, 
  label, 
  size = "default", 
  showIndicator = true,
  className 
}: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  
  return (
    <Badge 
      variant={config.variant} 
      size={size}
      className={cn(badgePresets.status, className)}
    >
      {showIndicator && (
        <span 
          className={cn(
            "inline-block rounded-full",
            size === "sm" ? "h-1.5 w-1.5" : size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2",
            config.indicatorClass
          )} 
          aria-hidden 
        />
      )}
      <span>{label}</span>
    </Badge>
  );
}

// 便捷的预设状态组件
export function HealthyBadge({ label = "Healthy", ...props }: Omit<StatusBadgeProps, "status">) {
  return <StatusBadge status="healthy" label={label} {...props} />;
}

export function RunningBadge({ label = "Running", ...props }: Omit<StatusBadgeProps, "status">) {
  return <StatusBadge status="running" label={label} {...props} />;
}

export function PendingBadge({ label = "Pending", ...props }: Omit<StatusBadgeProps, "status">) {
  return <StatusBadge status="pending" label={label} {...props} />;
}

export function FailedBadge({ label = "Failed", ...props }: Omit<StatusBadgeProps, "status">) {
  return <StatusBadge status="failed" label={label} {...props} />;
}

