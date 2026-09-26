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
import { ImageField } from "@/components/ui/ImageField";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { MediaCategory, MediaItem, MediaType } from "@/types";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";

export default function PoliticianMediaPage() {
  const { leader } = usePoliticianProfile();
  const { getMediaByIds, upsertMedia, deleteMedia, upsertLeader } = useContent();
  const [editing, setEditing] = useState<MediaItem | null>(null);

  const rows = useMemo(
    () => (leader ? getMediaByIds(leader.mediaIds) : []),
    [leader, getMediaByIds]
  );

  if (!leader) return null;

  return (
    <div>
      <AdminHeader
        title="Media"
        description="Stories, project updates and videos shown on your public media tab."
        action={
          <Button
            type="button"
            onClick={() =>
              setEditing({
                id: createId("med"),
                slug: "",
                title: "",
                category: "leader-updates",
                type: "article",
                image:
                  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&q=80",
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

      <AdminTable headers={["Title", "Category", "Type", "Date", ""]}>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="px-4 py-3 text-ink max-w-[240px] truncate">{m.title}</td>
            <td className="px-4 py-3 text-ink-muted">
              {MEDIA_CATEGORY_LABELS[m.category]}
            </td>
            <td className="px-4 py-3 capitalize text-ink-muted">{m.type}</td>
            <td className="px-4 py-3 text-ink-muted">{m.date}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(structuredClone(m))}
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
                  upsertLeader({
                    ...leader,
                    mediaIds: leader.mediaIds.filter((id) => id !== m.id),
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
        title="Media"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                if (!editing) return;
                const saved = {
                  ...editing,
                  slug: editing.slug || slugify(editing.title),
                  leaderId: leader.id,
                };
                upsertMedia(saved);
                if (!leader.mediaIds.includes(saved.id)) {
                  upsertLeader({
                    ...leader,
                    mediaIds: [...leader.mediaIds, saved.id],
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
            <ImageField
              label="Cover image"
              value={editing.image}
              onChange={(image) => setEditing({ ...editing, image })}
              hint="Thumbnail / cover for this media item. Paste a URL or upload from this device."
            />
            <AdminField label="Excerpt">
              <AdminTextarea
                value={editing.excerpt}
                onChange={(e) =>
                  setEditing({ ...editing, excerpt: e.target.value })
                }
              />
            </AdminField>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
