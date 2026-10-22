"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { AdminInput } from "@/components/admin/AdminUI";
import { createId } from "@/lib/store";
import type { PollOption } from "@/types";

/**
 * One input per poll option. Each row keeps its option id, so renaming,
 * inserting or removing a row never moves votes to a different option.
 * The server refuses (409) to remove an option that has votes; the row shows
 * the count and the caller surfaces the save error.
 */
export function PollOptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: PollOption[];
  onChange: (options: PollOption[]) => void;
  disabled?: boolean;
}) {
  const hintId = useId();

  const update = (id: string, label: string) =>
    onChange(options.map((o) => (o.id === id ? { ...o, label } : o)));

  const remove = (option: PollOption) => {
    if (
      option.votes > 0 &&
      !confirm(
        `"${option.label || "This option"}" has ${option.votes} ${option.votes === 1 ? "vote" : "votes"}. ` +
          "Options with votes cannot be removed; the save will be refused. Remove it anyway?"
      )
    ) {
      return;
    }
    onChange(options.filter((o) => o.id !== option.id));
  };

  const add = () => onChange([...options, { id: createId("opt"), label: "", votes: 0 }]);

  return (
    <fieldset className="space-y-1.5" aria-describedby={hintId}>
      <legend className="meta-label mb-1.5">Options</legend>
      <ol className="space-y-2">
        {options.map((option, index) => (
          <li key={option.id} className="flex items-center gap-2">
            <AdminInput
              aria-label={`Option ${index + 1}`}
              placeholder={`Option ${index + 1}`}
              value={option.label}
              disabled={disabled}
              onChange={(e) => update(option.id, e.target.value)}
            />
            {option.votes > 0 && (
              <span
                className="shrink-0 font-mono text-caption text-ink-subtle"
                title="Options with votes cannot be removed"
              >
                {option.votes} {option.votes === 1 ? "vote" : "votes"}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || options.length <= 1}
              aria-label={`Remove option ${index + 1}${option.votes > 0 ? ` (has ${option.votes} votes)` : ""}`}
              onClick={() => remove(option)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={add}>
        Add option
      </Button>
      <span id={hintId} className="block text-caption text-ink-subtle">
        Citizens vote on the public polls page. Renaming an option keeps its votes; an option with votes cannot be
        removed.
      </span>
    </fieldset>
  );
}
