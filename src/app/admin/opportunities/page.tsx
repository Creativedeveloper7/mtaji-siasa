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
import type { Opportunity, OpportunityCategory } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";
import { COUNTIES, OPPORTUNITY_CATEGORY_LABELS } from "@/lib/constants";

const emptyOpp = (): Opportunity => ({
  id: createId("opp"),
  slug: "",
  title: "",
  category: "jobs",
  location: "",
  county: "Nairobi",
  deadline: new Date().toISOString().slice(0, 10),
  eligibility: "",
  description: "",
  image: "",
});

export default function AdminOpportunitiesPage() {
  const { content, ready, upsertOpportunity, deleteOpportunity } = useContent();
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.opportunities.filter(
      (o) => !q || o.title.toLowerCase().includes(q) || o.location.toLowerCase().includes(q)
    );
  }, [content.opportunities, query]);

  if (!ready) return <LoadingState />;

  return (
    <div>
      <AdminHeader
        title="Opportunities"
        description="Jobs, tenders, training and funding linked to communities and projects."
        action={
          <Button type="button" onClick={() => setEditing(emptyOpp())}>
            Add opportunity
          </Button>
        }
      />
      <div className="mb-4 max-w-sm">
        <AdminInput placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <AdminTable headers={["Title", "Category", "County", "Deadline", ""]}>
        {rows.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-3 text-ink max-w-[260px] truncate">{o.title}</td>
            <td className="px-4 py-3 text-ink-muted">
              {OPPORTUNITY_CATEGORY_LABELS[o.category]}
            </td>
            <td className="px-4 py-3 text-ink-muted">{o.county}</td>
            <td className="px-4 py-3 text-ink-muted">{o.deadline}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(structuredClone(o))}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Delete this opportunity?")) deleteOpportunity(o.id);
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
        title="Opportunity"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                if (!editing) return;
                upsertOpportunity({
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
            <AdminField label="Category">
              <AdminSelect
                value={editing.category}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    category: e.target.value as OpportunityCategory,
                  })
                }
              >
                {Object.entries(OPPORTUNITY_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Location">
              <AdminInput
                value={editing.location}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
            </AdminField>
            <AdminField label="County">
              <AdminSelect
                value={editing.county}
                onChange={(e) => setEditing({ ...editing, county: e.target.value })}
              >
                {COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Deadline">
              <AdminInput
                type="date"
                value={editing.deadline}
                onChange={(e) => setEditing({ ...editing, deadline: e.target.value })}
              />
            </AdminField>
            <AdminField label="Eligibility">
              <AdminTextarea
                value={editing.eligibility}
                onChange={(e) => setEditing({ ...editing, eligibility: e.target.value })}
              />
            </AdminField>
            <AdminField label="Description">
              <AdminTextarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </AdminField>
            <ImageField
              label="Opportunity image"
              value={editing.image || ""}
              onChange={(image) =>
                setEditing({ ...editing, image: image || undefined })
              }
              optional
            />
            <AdminField label="Project ID (optional)">
              <AdminInput
                value={editing.projectId || ""}
                onChange={(e) =>
                  setEditing({ ...editing, projectId: e.target.value || undefined })
                }
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
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
