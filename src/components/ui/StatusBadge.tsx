import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  tone?: "neutral" | "success" | "warning" | "accent" | "error";
  pulse?: boolean;
  className?: string;
}

const tones = {
  neutral: "bg-surface text-ink-muted border-border",
  success: "bg-success-muted text-success border-success/25",
  warning: "bg-warning-muted text-warning border-warning/25",
  accent: "bg-accent-muted text-accent border-accent/30",
  error: "bg-error-muted text-error border-error/25",
};

export function StatusBadge({
  status,
  tone = "neutral",
  pulse,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-meta uppercase tracking-[0.06em]",
        tones[tone],
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {status}
    </span>
  );
}

export function statusToneForProject(
  status: string
): StatusBadgeProps["tone"] {
  switch (status) {
    case "completed":
      return "success";
    case "in-progress":
      return "accent";
    case "on-hold":
      return "warning";
    default:
      return "neutral";
  }
}
