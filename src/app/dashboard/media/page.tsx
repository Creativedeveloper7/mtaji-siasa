"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminSelect,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { MultiImageField } from "@/components/ui/MultiImageField";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { MediaCategory, MediaItem, MediaType } from "@/types";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";

export default function PoliticianMediaPage() {
  const { leader } = usePoliticianProfile();
  const { getMediaByIds, getProjectsByIds, upsertMedia, deleteMedia } = useContent();
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const open = (item: MediaItem) => {
    setError("");
    setEditing(item);
  };

  const photos = editing ? [editing.image, ...(editing.gallery ?? [])].filter(Boolean) : [];

  const rows = useMemo(
    () => (leader ? getMediaByIds(leader.mediaIds) : []),
    [leader, getMediaByIds]
  );

  if (!leader) return null;

  const projects = getProjectsByIds(leader.projectIds);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError("Add a title before saving.");
      return;
    }
    setSaving(true);
    setError("");
    const saved = {
      ...editing,
      slug: editing.slug || slugify(editing.title),
      leaderId: leader.id,
    };
    const result = await upsertMedia(saved);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Media"
        description="Stories, project updates and videos shown on your public media tab."
        action={
          <Button
            type="button"
            onClick={() =>
              open({
                id: createId("med"),
                slug: "",
                title: "",
                category: "leader-updates",
                type: "image",
                image: "",
                gallery: [],
                date: new Date().toISOString().slice(0, 10),
                excerpt: "",
                leaderId: leader.id,
              })
            }
          >
            Add media
          </Button>
        }
      />

      <AdminTable headers={["Title", "Category", "Type", "Photos", "Date", ""]}>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="px-4 py-3 text-ink max-w-[240px] truncate">{m.title}</td>
            <td className="px-4 py-3 text-ink-muted">
              {MEDIA_CATEGORY_LABELS[m.category]}
            </td>
            <td className="px-4 py-3 capitalize text-ink-muted">{m.type}</td>
            <td className="px-4 py-3 font-mono text-ink-muted">
              {(m.image ? 1 : 0) + (m.gallery?.length ?? 0)}
            </td>
            <td className="px-4 py-3 text-ink-muted">{m.date}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => open(structuredClone(m))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm("Delete this item?")) return;
                  deleteMedia(m.id);
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
        title="Media"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
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
            <AdminField label="Title">
              <AdminInput
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Category">
                <AdminSelect
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: e.target.value as MediaCategory,
                    })
                  }
                >
                  {Object.entries(MEDIA_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Type">
                <AdminSelect
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      type: e.target.value as MediaType,
                    })
                  }
                >
                  <option value="article">Article</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </AdminSelect>
              </AdminField>
            </div>
            <AdminField label="Date">
              <AdminInput
                type="date"
                value={editing.date}
                onChange={(e) =>
                  setEditing({ ...editing, date: e.target.value })
                }
              />
            </AdminField>
            <MultiImageField
              label="Photos"
              value={photos}
              onChange={(next) =>
                setEditing({ ...editing, image: next[0] ?? "", gallery: next.slice(1) })
              }
              hint="Select several photos at once. The first one is the cover; the rest appear as a gallery on the story page."
            />
            <AdminField label="Linked project (optional)">
              <AdminSelect
                value={editing.projectId ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, projectId: e.target.value || undefined })
                }
              >
                <option value="">Not linked to a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Excerpt">
              <AdminTextarea
                value={editing.excerpt}
                onChange={(e) =>
                  setEditing({ ...editing, excerpt: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Full story (optional)" hint="Separate paragraphs with a blank line.">
              <AdminTextarea
                className="min-h-[160px]"
                value={editing.body ?? ""}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </AdminField>
            {error && (
              <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">
                {error}
              </p>
            )}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
