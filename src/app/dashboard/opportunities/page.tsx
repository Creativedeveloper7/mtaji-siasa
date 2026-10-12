"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { useApplications } from "@/components/opportunities/useApplications";
import { createId, slugify } from "@/lib/store";
import type { Opportunity, OpportunityCategory } from "@/types";
import { COUNTIES, OPPORTUNITY_CATEGORY_LABELS } from "@/lib/constants";

export default function PoliticianOpportunitiesPage() {
  const { leader } = usePoliticianProfile();
  const {
    getOpportunitiesByIds,
    getProjectsByIds,
    upsertOpportunity,
    deleteOpportunity,
  } = useContent();
  const received = useApplications("received");
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(
    () => (leader ? getOpportunitiesByIds(leader.opportunityIds) : []),
    [leader, getOpportunitiesByIds]
  );
  const projects = useMemo(
    () => (leader ? getProjectsByIds(leader.projectIds) : []),
    [leader, getProjectsByIds]
  );
  const applicationCounts = useMemo(() => {
    const counts = new Map<string, { total: number; fresh: number }>();
    for (const item of received.items) {
      const entry = counts.get(item.opportunityId) ?? { total: 0, fresh: 0 };
      entry.total += 1;
      if (item.status === "submitted") entry.fresh += 1;
      counts.set(item.opportunityId, entry);
    }
    return counts;
  }, [received.items]);

  const blank = (projectId?: string): Opportunity => {
    const project = projects.find((p) => p.id === projectId);
    return {
      id: createId("opp"),
      slug: "",
      title: "",
      category: "jobs",
      location: project?.location || leader?.county || "",
      county: project?.county || leader?.county || "Nairobi",
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      eligibility: "",
      description: "",
      image: "",
      leaderId: leader?.id,
      projectId: project?.id,
    };
  };

  const open = (item: Opportunity) => {
    setError("");
    setEditing(item);
  };

  // /dashboard/opportunities?project=<id> (from the Projects page) starts a new
  // opportunity already linked to that project.
  const projectsLoaded = projects.length > 0;
  useEffect(() => {
    if (!projectsLoaded) return;
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (!projectId) return;
    open(blank(projectId));
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoaded]);

  if (!leader) return null;

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError("Add a title before saving.");
      return;
    }
    setSaving(true);
    setError("");
    const result = await upsertOpportunity({
      ...editing,
      slug: editing.slug || slugify(editing.title),
      leaderId: leader.id,
    });
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
        title="Opportunities"
        description="Jobs, tenders, training and funding linked to your work."
        action={
          <Button
            type="button"
            onClick={() => open(blank())}
          >
            Add opportunity
          </Button>
        }
      />

      <AdminTable headers={["Title", "Category", "Project", "Deadline", "Applications", ""]}>
        {rows.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-3 text-ink max-w-[240px] truncate">{o.title}</td>
            <td className="px-4 py-3 text-ink-muted">
              {OPPORTUNITY_CATEGORY_LABELS[o.category]}
            </td>
            <td className="px-4 py-3 text-ink-muted max-w-[180px] truncate">
              {projects.find((p) => p.id === o.projectId)?.name ?? "—"}
            </td>
            <td className="px-4 py-3 text-ink-muted">{o.deadline}</td>
            <td className="px-4 py-3">
              <Link
                href={`/dashboard/applications?opportunity=${encodeURIComponent(o.id)}`}
                className="inline-flex items-center gap-2 text-ink hover:text-accent"
              >
                <span className="font-mono">{applicationCounts.get(o.id)?.total ?? 0}</span>
                {(applicationCounts.get(o.id)?.fresh ?? 0) > 0 && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink-inverse">
                    {applicationCounts.get(o.id)?.fresh} new
                  </span>
                )}
              </Link>
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => open(structuredClone(o))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm("Delete this opportunity? Its applications are deleted too.")) return;
                  void deleteOpportunity(o.id);
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
            <Button type="button" fullWidth disabled={saving} onClick={() => void save()}>
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
            <AdminField
              label="Linked project"
              hint="Link this opportunity to the project that needs the people, suppliers or partners."
            >
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
            <AdminField label="Organisation (optional)">
              <AdminInput
                value={editing.organization ?? ""}
                placeholder="Who is offering this opportunity"
                onChange={(e) =>
                  setEditing({ ...editing, organization: e.target.value || undefined })
                }
              />
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
