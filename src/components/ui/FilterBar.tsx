"use client";

import { cn } from "@/lib/utils";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: {
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }[];
  className?: string;
}

export function FilterBar({ filters, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 md:gap-4",
        className
      )}
    >
      {filters.map((filter) => (
        <label key={filter.id} className="flex min-w-[140px] flex-1 flex-col gap-1.5 md:flex-none md:w-44">
          <span className="meta-label">{filter.label}</span>
          <select
            id={filter.id}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="h-11 rounded-md border border-border bg-surface px-3 text-small text-ink transition-colors duration-fast hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
