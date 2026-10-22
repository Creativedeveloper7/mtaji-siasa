"use client";

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function AdminHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-h2 text-ink">{title}</h1>
        {description && (
          <p className="mt-2 text-small text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function AdminField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="meta-label">{label}</span>
      {children}
      {hint && <span className="block text-caption text-ink-subtle">{hint}</span>}
    </label>
  );
}

const controlClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-small text-ink transition-colors hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30";

export function AdminInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, props.className)} {...props} />;
}

export function AdminSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, props.className)} {...props} />;
}

export function AdminTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea
      className={cn(
        "min-h-[96px] w-full rounded-md border border-border bg-surface px-3 py-2.5 text-small text-ink transition-colors hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30",
        props.className
      )}
      {...props}
    />
  );
}

/**
 * Inline message box. Errors are announced immediately (role="alert");
 * warnings politely (role="status").
 */
export function AdminNotice({
  tone = "error",
  messages,
  onDismiss,
  className,
}: {
  tone?: "error" | "warning";
  messages: string | string[];
  onDismiss?: () => void;
  className?: string;
}) {
  const list = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-small",
        tone === "error"
          ? "border-error/30 bg-error-muted text-error"
          : "border-warning/30 bg-warning-muted text-warning",
        className
      )}
    >
      {list.length === 1 ? (
        <p>{list[0]}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4">
          {list.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-caption underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

/** Flatten fragments/arrays so every <tr> can be reached. */
function rowsOf(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? rowsOf(child.props.children)
      : [child]
  );
}

/** Give each <td> its column heading as data-label, used by the stacked phone layout. */
function labelRow(row: ReactNode, headers: string[]): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(row) || row.type !== "tr") return row;
  let column = 0;
  const cells = Children.toArray(row.props.children).map((cell) => {
    if (!isValidElement<Record<string, unknown>>(cell) || cell.type !== "td") return cell;
    const label = headers[column++] ?? "";
    return cloneElement(cell as ReactElement<Record<string, unknown>>, { "data-label": label });
  });
  return cloneElement(row, {}, ...cells);
}

/**
 * Data table. From md up it is a normal table; on phones each row becomes a
 * card with "Heading: value" lines (see .admin-table in globals.css).
 */
export function AdminTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="admin-table overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-small">
        <thead className="border-b border-border bg-surface">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 font-medium text-ink-muted whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rowsOf(children).map((row) => labelRow(row, headers))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDrawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-border bg-bg-elevated shadow-raised animate-slide-in-right">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-h3 text-ink">{title}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="border-t border-border px-5 py-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}
