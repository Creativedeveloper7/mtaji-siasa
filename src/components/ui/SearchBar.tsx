"use client";

import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Visible label above the field */
  label?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  id = "search",
  label,
}: SearchBarProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-caption font-bold text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-border-strong bg-surface pl-10 pr-4 text-small text-ink placeholder:text-ink-subtle transition-colors hover:border-accent/40 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
          aria-label={label ? undefined : placeholder}
        />
      </div>
    </div>
  );
}
