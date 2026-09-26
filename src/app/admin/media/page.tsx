"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminSelect,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { MediaCategory, MediaItem, MediaType } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";

const emptyMedia = (): MediaItem => ({
  id: createId("med"),
  slug: "",
  title: "",
  category: "news",
  type: "article",
  image:
    "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80",
  date: new Date().toISOString().slice(0, 10),
  excerpt: "",
});

export default function AdminMediaPage() {
  const { content, ready, upsertMedia, deleteMedia } = useContent();
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.media.filter(
      (m) => !q || m.title.toLowerCase().includes(q) || m.excerpt.toLowerCase().includes(q)
    );
  }, [content.media, query]);

  if (!ready) return <LoadingState />;

  return (
    <div>
      <AdminHeader
        title="Media"
        description="Editorial stories, project updates, videos and news."
        action={
          <Button type="button" onClick={() => setEditing(emptyMedia())}>
            Add media
          </Button>
        }
      />
      <div className="mb-4 max-w-sm">
        <AdminInput placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <AdminTable headers={["Title", "Category", "Type", "Date", ""]}>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="px-4 py-3 text-ink max-w-[260px] truncate">{m.title}</td>
            <td className="px-4 py-3 text-ink-muted">
              {MEDIA_CATEGORY_LABELS[m.category]}
            </td>
            <td className="px-4 py-3 capitalize text-ink-muted">{m.type}</td>
            <td className="px-4 py-3 text-ink-muted">{m.date}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(structuredClone(m))}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Delete this item?")) deleteMedia(m.id);
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
        title="Media item"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                if (!editing) return;
                upsertMedia({
                  ...editing,
                  slug: editing.slug || slugify(editing.title),
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
            <AdminField label="Title">
              <AdminInput
                value={editing.title}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    title: e.target.value,
                    slug: editing.slug || slugify(e.target.value),
                  })
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
                    setEditing({ ...editing, type: e.target.value as MediaType })
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
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </AdminField>
            <ImageField
              label="Cover image"
              value={editing.image}
              onChange={(image) => setEditing({ ...editing, image })}
            />
            <AdminField label="Excerpt">
              <AdminTextarea
                value={editing.excerpt}
                onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
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
            <AdminField label="Project ID (optional)">
              <AdminInput
                value={editing.projectId || ""}
                onChange={(e) =>
                  setEditing({ ...editing, projectId: e.target.value || undefined })
                }
              />
            </AdminField>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
