"use client";

type ErrorStateProps = {
  message: string;
  hint?: string;
  className?: string;
};

export function ErrorState({ message, hint, className }: ErrorStateProps) {
  return (
    <div className={`w-full py-8 text-center ${className ?? ""}`}>
      <div className="text-sm font-medium text-error">{message}</div>
      {hint && <div className="mt-1 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

