"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { PollOptionsEditor } from "@/components/admin/PollOptionsEditor";
import { useSaveAction } from "@/components/admin/useSaveAction";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Poll } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";

const emptyPoll = (): Poll => ({
  id: createId("pol"),
  slug: "",
  question: "",
  options: [
    { id: createId("opt"), label: "Option A", votes: 0 },
    { id: createId("opt"), label: "Option B", votes: 0 },
  ],
  closingDate: "",
  participationCount: 0,
});

export default function AdminPollsPage() {
  const { content, ready, upsertPoll, deletePoll } = useContent();
  const [editing, setEditing] = useState<Poll | null>(null);
  const [query, setQuery] = useState("");
  const { saving, error, setError, notice, setNotice, run, remove } = useSaveAction();

  const open = (poll: Poll) => {
    setError("");
    setEditing(poll);
  };

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.polls.filter((p) => !q || p.question.toLowerCase().includes(q));
  }, [content.polls, query]);

  if (!ready) return <LoadingState />;

  const save = async () => {
    if (!editing) return;
    const options = editing.options
      .map((o) => ({ ...o, id: o.id || createId("opt"), label: o.label.trim() }))
      .filter((o) => o.label);
    if (!editing.question.trim()) {
      setError("Add a question before saving.");
      return;
    }
    if (!options.length) {
      setError("Add at least one option.");
      return;
    }
    const result = await run(() =>
      upsertPoll({
        ...editing,
        slug: editing.slug || slugify(editing.question),
        options,
        participationCount:
          Number(editing.participationCount) ||
          options.reduce((s, o) => s + o.votes, 0),
      })
    );
    if (result?.ok) setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Polls"
        description="Community polls shown on the public polls page and leader profiles."
        action={
          <Button type="button" onClick={() => open(emptyPoll())}>
            Add poll
          </Button>
        }
      />
      {notice && (
        <AdminNotice
          className="mb-4"
          tone={notice.tone}
          messages={notice.messages}
          onDismiss={() => setNotice(null)}
        />
      )}
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
            <td className="px-4 py-3 text-ink-muted">{p.closingDate || "Open"}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button type="button" size="sm" variant="ghost" onClick={() => open(structuredClone(p))}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (confirm("Delete this poll?")) void remove(() => deletePoll(p.id));
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
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        footer={
          <div className="flex gap-2">
            <Button type="button" fullWidth disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" fullWidth disabled={saving} onClick={() => setEditing(null)}>
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
            <AdminField label="Closing date" hint="Leave empty to keep the poll open until you close it.">
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
            <PollOptionsEditor
              options={editing.options}
              disabled={saving}
              onChange={(options) => setEditing({ ...editing, options })}
            />
            {error && <AdminNotice messages={error} />}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
