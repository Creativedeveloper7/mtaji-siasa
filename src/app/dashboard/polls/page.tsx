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
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Poll } from "@/types";

export default function PoliticianPollsPage() {
  const { leader } = usePoliticianProfile();
  const { getPollsByIds, upsertPoll, deletePoll, upsertLeader } = useContent();
  const [editing, setEditing] = useState<Poll | null>(null);

  const rows = useMemo(
    () => (leader ? getPollsByIds(leader.pollIds) : []),
    [leader, getPollsByIds]
  );

  if (!leader) return null;

  return (
    <div>
      <AdminHeader
        title="Polls"
        description="Community questions that appear on your public polls tab."
        action={
          <Button
            type="button"
            onClick={() =>
              setEditing({
                id: createId("pol"),
                slug: "",
                question: "",
                options: [
                  { id: "o1", label: "Option A", votes: 0 },
                  { id: "o2", label: "Option B", votes: 0 },
                ],
                closingDate: new Date().toISOString().slice(0, 10),
                participationCount: 0,
                leaderId: leader.id,
              })
            }
          >
            Add poll
          </Button>
        }
      />

      <AdminTable headers={["Question", "Options", "Participants", ""]}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-ink max-w-[280px] truncate">
              {p.question}
            </td>
            <td className="px-4 py-3 font-mono text-ink-subtle">
              {p.options.length}
            </td>
            <td className="px-4 py-3 font-mono text-ink-muted">
              {p.participationCount}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(structuredClone(p))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm("Delete this poll?")) return;
                  deletePoll(p.id);
                  upsertLeader({
                    ...leader,
                    pollIds: leader.pollIds.filter((id) => id !== p.id),
                  });
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
                const saved = {
                  ...editing,
                  slug: editing.slug || slugify(editing.question),
                  options,
                  leaderId: leader.id,
                  participationCount:
                    Number(editing.participationCount) ||
                    options.reduce((s, o) => s + o.votes, 0),
                };
                upsertPoll(saved);
                if (!leader.pollIds.includes(saved.id)) {
                  upsertLeader({
                    ...leader,
                    pollIds: [...leader.pollIds, saved.id],
                  });
                }
                setEditing(null);
              }}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setEditing(null)}
            >
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
                  setEditing({ ...editing, question: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Closing date">
              <AdminInput
                type="date"
                value={editing.closingDate}
                onChange={(e) =>
                  setEditing({ ...editing, closingDate: e.target.value })
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
