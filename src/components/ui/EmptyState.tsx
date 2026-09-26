import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center",
        className
      )}
    >
      <h3 className="text-h3 text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-small text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center px-4 py-24"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-small text-ink-muted">
        <span className="h-4 w-4 animate-pulse-soft rounded-full border border-accent/40 border-t-accent" />
        {label}
      </div>
    </div>
  );
}
