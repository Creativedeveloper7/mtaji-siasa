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
import type { Opportunity, OpportunityCategory } from "@/types";
import { COUNTIES, OPPORTUNITY_CATEGORY_LABELS } from "@/lib/constants";

export default function PoliticianOpportunitiesPage() {
  const { leader } = usePoliticianProfile();
  const {
    getOpportunitiesByIds,
    upsertOpportunity,
    deleteOpportunity,
    upsertLeader,
  } = useContent();
  const [editing, setEditing] = useState<Opportunity | null>(null);

  const rows = useMemo(
    () => (leader ? getOpportunitiesByIds(leader.opportunityIds) : []),
    [leader, getOpportunitiesByIds]
  );

  if (!leader) return null;

  return (
    <div>
      <AdminHeader
        title="Opportunities"
        description="Jobs, tenders, training and funding linked to your work."
        action={
          <Button
            type="button"
            onClick={() =>
              setEditing({
                id: createId("opp"),
                slug: "",
                title: "",
                category: "jobs",
                location: leader.county,
                county: leader.county,
                deadline: new Date().toISOString().slice(0, 10),
                eligibility: "",
                description: "",
                image: "",
                leaderId: leader.id,
              })
            }
          >
            Add opportunity
          </Button>
        }
      />

      <AdminTable headers={["Title", "Category", "Deadline", ""]}>
        {rows.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-3 text-ink max-w-[240px] truncate">{o.title}</td>
            <td className="px-4 py-3 text-ink-muted">
              {OPPORTUNITY_CATEGORY_LABELS[o.category]}
            </td>
            <td className="px-4 py-3 text-ink-muted">{o.deadline}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(structuredClone(o))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm("Delete this opportunity?")) return;
                  deleteOpportunity(o.id);
                  upsertLeader({
                    ...leader,
                    opportunityIds: leader.opportunityIds.filter(
                      (id) => id !== o.id
                    ),
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
        title="Opportunity"
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
                upsertOpportunity(saved);
                if (!leader.opportunityIds.includes(saved.id)) {
                  upsertLeader({
                    ...leader,
                    opportunityIds: [...leader.opportunityIds, saved.id],
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
                onChange={(e) =>
                  setEditing({ ...editing, location: e.target.value })
                }
              />
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
            <AdminField label="Deadline">
              <AdminInput
                type="date"
                value={editing.deadline}
                onChange={(e) =>
                  setEditing({ ...editing, deadline: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Eligibility">
              <AdminTextarea
                value={editing.eligibility}
                onChange={(e) =>
                  setEditing({ ...editing, eligibility: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Description">
              <AdminTextarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </AdminField>
            <ImageField
              label="Opportunity image"
              value={editing.image || ""}
              onChange={(image) =>
                setEditing({ ...editing, image: image || undefined })
              }
              optional
              hint="Optional cover image. Paste a URL or upload from this device."
            />
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
