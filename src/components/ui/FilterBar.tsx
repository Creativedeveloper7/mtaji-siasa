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

export const filterControlClass =
  "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-small text-ink transition-colors hover:border-accent/40 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30";

export function FilterBar({ filters, className }: FilterBarProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {filters.map((filter) => (
        <label key={filter.id} htmlFor={filter.id} className="block">
          <span className="mb-1.5 block text-caption font-bold text-ink">{filter.label}</span>
          <select
            id={filter.id}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className={filterControlClass}
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

export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1.5 block text-caption font-bold text-ink">{label}</span>
      <div className="card-carousel -mx-[var(--container-pad)] flex gap-2 overflow-x-auto px-[var(--container-pad)] pb-1 md:mx-0 md:flex-wrap md:px-0">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "h-9 shrink-0 rounded-md border px-3.5 text-caption font-bold transition-colors",
                active
                  ? "border-accent bg-accent text-[#211b12]"
                  : "border-border-strong bg-surface text-ink hover:border-accent/50"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
