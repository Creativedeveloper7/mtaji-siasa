"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Poll } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";

const emptyPoll = (): Poll => ({
  id: createId("pol"),
  slug: "",
  question: "",
  options: [
    { id: "o1", label: "Option A", votes: 0 },
    { id: "o2", label: "Option B", votes: 0 },
  ],
  closingDate: new Date().toISOString().slice(0, 10),
  participationCount: 0,
});

export default function AdminPollsPage() {
  const { content, ready, upsertPoll, deletePoll } = useContent();
  const [editing, setEditing] = useState<Poll | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.polls.filter((p) => !q || p.question.toLowerCase().includes(q));
  }, [content.polls, query]);

  if (!ready) return <LoadingState />;

  return (
    <div>
      <AdminHeader
        title="Polls"
        description="Community polls shown on the public polls page and leader profiles."
        action={
          <Button type="button" onClick={() => setEditing(emptyPoll())}>
            Add poll
          </Button>
        }
      />
      <div className="mb-4 max-w-sm">
        <AdminInput placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <AdminTable headers={["Question", "Options", "Participants", "Closes", ""]}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-ink max-w-[280px] truncate">{p.question}</td>
            <td className="px-4 py-3 font-mono text-ink-subtle">{p.options.length}</td>
            <td className="px-4 py-3 font-mono text-ink-muted">
              {p.participationCount}
            </td>
            <td className="px-4 py-3 text-ink-muted">{p.closingDate}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(structuredClone(p))}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Delete this poll?")) deletePoll(p.id);
                }}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </AdminTable>

      <AdminDrawer
        open={!!editing}
        title="Poll"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                if (!editing) return;
                const options = editing.options
                  .map((o, i) => ({
                    ...o,
                    id: o.id || `o${i + 1}`,
                    label: o.label.trim(),
                  }))
                  .filter((o) => o.label);
                upsertPoll({
                  ...editing,
                  slug: editing.slug || slugify(editing.question),
                  options,
                  participationCount:
                    Number(editing.participationCount) ||
                    options.reduce((s, o) => s + o.votes, 0),
                });
                setEditing(null);
              }}
            >
              Save
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <AdminField label="Question">
              <AdminTextarea
                value={editing.question}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    question: e.target.value,
                    slug: editing.slug || slugify(e.target.value),
                  })
                }
              />
            </AdminField>
            <AdminField label="Closing date">
              <AdminInput
                type="date"
                value={editing.closingDate}
                onChange={(e) => setEditing({ ...editing, closingDate: e.target.value })}
              />
            </AdminField>
            <AdminField label="Leader ID (optional)">
              <AdminInput
                value={editing.leaderId || ""}
                onChange={(e) =>
                  setEditing({ ...editing, leaderId: e.target.value || undefined })
                }
              />
            </AdminField>
            <AdminField label="Options (label|votes per line)">
              <AdminTextarea
                value={editing.options
                  .map((o) => `${o.label}|${o.votes}`)
                  .join("\n")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    options: e.target.value.split("\n").map((line, i) => {
                      const [label, votes] = line.split("|");
                      return {
                        id: `o${i + 1}`,
                        label: (label || "").trim(),
                        votes: Number(votes) || 0,
                      };
                    }),
                  })
                }
              />
            </AdminField>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
