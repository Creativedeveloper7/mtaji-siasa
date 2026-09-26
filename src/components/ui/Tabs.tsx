"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  href?: string;
}

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
}

export function Tabs({ items, activeId, onChange, className }: TabsProps) {
  return (
    <div
      className={cn("flex gap-0 overflow-x-auto border-b border-border scrollbar-none", className)}
      role="tablist"
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const classNameTab = cn(
          "relative shrink-0 whitespace-nowrap px-4 py-3 text-small transition-colors duration-fast",
          active ? "text-ink" : "text-ink-muted hover:text-ink"
        );

        const indicator = active ? (
          <span className="absolute inset-x-4 bottom-0 h-px bg-accent" aria-hidden />
        ) : null;

        if (item.href) {
          return (
            <Link
              key={item.id}
              href={item.href}
              role="tab"
              aria-selected={active}
              className={classNameTab}
            >
              {item.label}
              {indicator}
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(item.id)}
            className={classNameTab}
          >
            {item.label}
            {indicator}
          </button>
        );
      })}
    </div>
  );
}
