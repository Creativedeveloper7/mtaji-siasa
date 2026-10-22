"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminSelect,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { useSaveAction } from "@/components/admin/useSaveAction";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Leader, LeaderType } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";
import { COUNTIES } from "@/lib/constants";

const emptyLeader = (): Leader => ({
  id: createId("ldr"),
  slug: "",
  name: "",
  honorific: "Hon.",
  position: "",
  type: "elected",
  county: "Nairobi",
  photo:
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
  shortBio: "",
  bio: "",
  achievements: [],
  social: {},
  projectIds: [],
  opportunityIds: [],
  mediaIds: [],
  pollIds: [],
  productIds: [],
});

export default function AdminLeadersPage() {
  const { content, ready, upsertLeader, deleteLeader } = useContent();
  const [editing, setEditing] = useState<Leader | null>(null);
  const [query, setQuery] = useState("");
  const { saving, error, setError, notice, setNotice, run, remove } = useSaveAction();

  const open = (leader: Leader) => {
    setError("");
    setEditing(leader);
  };

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.leaders.filter(
      (l) =>
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.position.toLowerCase().includes(q) ||
        l.county.toLowerCase().includes(q)
    );
  }, [content.leaders, query]);

  if (!ready) return <LoadingState />;

  const save = async () => {
    if (!editing) return;
    const slug = editing.slug || slugify(editing.name);
    const result = await run(() =>
      upsertLeader({
        ...editing,
        slug,
        achievements: editing.achievements.filter(Boolean),
      })
    );
    if (result?.ok) setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Leaders"
        description="Create and edit elected leaders and aspirants. Position is free-text."
        action={
          <Button type="button" onClick={() => open(emptyLeader())}>
            Add leader
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
        <AdminInput
          placeholder="Search leaders…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <AdminTable headers={["Name", "Position", "County", "Type", "Projects", ""]}>
        {rows.map((l) => (
          <tr key={l.id} className="bg-bg-elevated/40">
            <td className="px-4 py-3 text-ink">
              {l.honorific} {l.name}
            </td>
            <td className="px-4 py-3 text-ink-muted max-w-[220px] truncate">
              {l.position}
            </td>
            <td className="px-4 py-3 text-ink-muted">{l.county}</td>
            <td className="px-4 py-3 capitalize text-ink-muted">{l.type}</td>
            <td className="px-4 py-3 font-mono text-ink-subtle">
              {l.projectIds.length}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => open(structuredClone(l))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (confirm(`Delete ${l.name}?`)) void remove(() => deleteLeader(l.id));
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
        title={editing?.name ? `Edit ${editing.name}` : "New leader"}
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        footer={
          <div className="flex gap-2">
            <Button type="button" fullWidth disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save leader"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <AdminField label="Honorific">
              <AdminInput
                value={editing.honorific}
                onChange={(e) =>
                  setEditing({ ...editing, honorific: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Full name">
              <AdminInput
                value={editing.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    slug: editing.slug || slugify(e.target.value),
                  })
                }
              />
            </AdminField>
            <AdminField label="Slug">
              <AdminInput
                value={editing.slug}
                onChange={(e) =>
                  setEditing({ ...editing, slug: slugify(e.target.value) })
                }
              />
            </AdminField>
            <AdminField
              label="Position / office"
              hint="Manual text — not limited to a dropdown."
            >
              <AdminInput
                value={editing.position}
                onChange={(e) =>
                  setEditing({ ...editing, position: e.target.value })
                }
              />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Type">
                <AdminSelect
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      type: e.target.value as LeaderType,
                    })
                  }
                >
                  <option value="elected">Elected</option>
                  <option value="aspirant">Aspirant</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="County">
                <AdminSelect
                  value={editing.county}
                  onChange={(e) =>
                    setEditing({ ...editing, county: e.target.value })
                  }
                >
                  {COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
            </div>
            <ImageField
              label="Profile photo"
              value={editing.photo}
              onChange={(photo) => setEditing({ ...editing, photo })}
            />
            <ImageField
              label="Cover image"
              value={editing.coverImage || ""}
              onChange={(coverImage) =>
                setEditing({
                  ...editing,
                  coverImage: coverImage || undefined,
                })
              }
              optional
            />
            <AdminField label="Short bio">
              <AdminTextarea
                value={editing.shortBio}
                onChange={(e) =>
                  setEditing({ ...editing, shortBio: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Full bio">
              <AdminTextarea
                value={editing.bio}
                onChange={(e) =>
                  setEditing({ ...editing, bio: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Achievements (one per line)">
              <AdminTextarea
                value={editing.achievements.join("\n")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    achievements: e.target.value.split("\n"),
                  })
                }
              />
            </AdminField>
            <AdminField label="Linked project IDs (comma-separated)">
              <AdminInput
                value={editing.projectIds.join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    projectIds: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </AdminField>
            {error && <AdminNotice messages={error} />}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
