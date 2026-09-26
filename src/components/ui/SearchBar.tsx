"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  id = "search",
}: SearchBarProps) {
  return (
    <div className={cn("relative", className)}>
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
        className="h-11 w-full rounded-md border border-border bg-surface pl-10 pr-4 text-small text-ink placeholder:text-ink-subtle transition-colors duration-fast hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        aria-label={placeholder}
      />
    </div>
  );
}
