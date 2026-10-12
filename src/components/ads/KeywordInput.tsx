"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { AdminInput } from "@/components/admin/AdminUI";

/** Type a keyword and press Enter or comma; tap a suggestion to add it. */
export function KeywordInput({
  value,
  onChange,
  suggestions = [],
  max = 20,
  maxLength = 80,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  max?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((k) => k.trim().replace(/\s+/g, " ").slice(0, maxLength))
      .filter(Boolean);
    const next = [...value];
    for (const part of parts) {
      if (next.length >= max) break;
      if (!next.some((k) => k.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const unused = suggestions.filter((s) => !value.some((k) => k.toLowerCase() === s.toLowerCase())).slice(0, 8);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <li
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft py-1 pl-3 pr-1 text-caption text-ink"
            >
              {keyword}
              <button
                type="button"
                onClick={() => onChange(value.filter((k) => k !== keyword))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
                aria-label={`Remove ${keyword}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <AdminInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={value.length >= max ? `Limit of ${max} reached` : "e.g. Thika roads, youth jobs"}
          disabled={value.length >= max}
          aria-label="Add keyword"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim() || value.length >= max}
          className="h-11 shrink-0 rounded-md border border-border-strong px-4 text-small text-ink transition-colors hover:border-accent/50 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-ink-subtle">Suggestions:</span>
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border px-2.5 text-caption text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {s}
            </button>
          ))}
        </div>
      )}
      <p className="text-caption text-ink-subtle">
        {value.length}/{max} keywords. Words people search for or talk about, e.g. the area, the project type, the issue it solves.
      </p>
    </div>
  );
}
