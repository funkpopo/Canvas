interface StatusBadgeProps {
  status: "healthy" | "warning" | "critical" | "info";
  label: string;
}

const palette = {
  healthy: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
  warning: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
  critical: "bg-rose-500/20 text-rose-200 border border-rose-500/40",
  info: "bg-sky-500/20 text-sky-200 border border-sky-500/40",
} as const;

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${palette[status]}`}>
      <span className="inline-block h-2 w-2 rounded-full bg-current/70" aria-hidden />
      <span className="ml-2">{label}</span>
    </span>
  );
}
