import { Badge, badgePresets } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n/i18n";
import { 
  CheckCircle2, 
  Play, 
  Check, 
  AlertTriangle, 
  Clock, 
  XCircle, 
  X, 
  Circle, 
  Square, 
  Info, 
  HelpCircle
} from "lucide-react";

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
    indicatorClass: "text-success",
    icon: CheckCircle2
  },
  ready: { 
    variant: "success" as const, 
    indicatorClass: "",
    icon: CheckCircle2
  },
  running: { 
    variant: "success" as const, 
    indicatorClass: "animate-pulse",
    icon: Play
  },
  succeeded: { 
    variant: "success-light" as const, 
    indicatorClass: "text-success",
    icon: Check
  },
  warning: { 
    variant: "warning-light" as const, 
    indicatorClass: "text-warning animate-pulse",
    icon: AlertTriangle
  },
  pending: { 
    variant: "warning" as const, 
    indicatorClass: "animate-pulse",
    icon: Clock
  },
  critical: { 
    variant: "destructive" as const, 
    indicatorClass: "animate-pulse",
    icon: XCircle
  },
  failed: { 
    variant: "destructive" as const, 
    indicatorClass: "",
    icon: X
  },
  "not-ready": { 
    variant: "error-light" as const, 
    indicatorClass: "text-error",
    icon: Circle
  },
  terminating: { 
    variant: "warning-light" as const, 
    indicatorClass: "text-warning animate-pulse",
    icon: Square
  },
  info: { 
    variant: "info-light" as const, 
    indicatorClass: "text-info",
    icon: Info
  },
  unknown: { 
    variant: "neutral-light" as const, 
    indicatorClass: "text-badge-neutral",
    icon: HelpCircle
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
  const IconComponent = config.icon;
  
  const iconSize = size === "sm" ? 12 : size === "lg" ? 16 : 14;
  
  return (
    <Badge 
      variant={config.variant} 
      size={size}
      className={cn(badgePresets.status, className)}
    >
      {showIndicator && (
        <IconComponent 
          className={cn(
            "inline-block",
            config.indicatorClass
          )} 
          size={iconSize}
          aria-hidden 
        />
      )}
      <span>{label}</span>
    </Badge>
  );
}

// 便捷的预设状态组件
export function HealthyBadge({ label, ...props }: Omit<StatusBadgeProps, "status">) {
  const { t } = useI18n();
  return <StatusBadge status="healthy" label={label ?? t("status.healthy")} {...props} />;
}

export function RunningBadge({ label, ...props }: Omit<StatusBadgeProps, "status">) {
  const { t } = useI18n();
  return <StatusBadge status="running" label={label ?? t("status.running")} {...props} />;
}

export function PendingBadge({ label, ...props }: Omit<StatusBadgeProps, "status">) {
  const { t } = useI18n();
  return <StatusBadge status="pending" label={label ?? t("status.pending")} {...props} />;
}

export function FailedBadge({ label, ...props }: Omit<StatusBadgeProps, "status">) {
  const { t } = useI18n();
  return <StatusBadge status="failed" label={label ?? t("status.failed")} {...props} />;
}

