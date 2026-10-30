"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
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
import { ImageField } from "@/components/ui/ImageField";
import { CoordinatePickerMap } from "@/components/gis/CoordinatePickerMap";
import { ProjectCategoryField } from "@/components/admin/ProjectCategoryField";
import { DEFAULT_MAP_CENTER } from "@/lib/projects";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useSaveAction } from "@/components/admin/useSaveAction";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Project, ProjectCategory, ProjectStatus } from "@/types";
import { COUNTIES, OPPORTUNITY_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/constants";

function emptyProject(leaderId: string): Project {
  return {
    id: createId("prj"),
    slug: "",
    name: "",
    category: "infrastructure",
    subcategory: "roads",
    location: "",
    county: "Nairobi",
    status: "planned",
    progress: 0,
    image: "",
    description: "",
    startDate: new Date().toISOString().slice(0, 10),
    expectedCompletion: new Date().toISOString().slice(0, 10),
    leaderIds: [leaderId],
    geo: { center: { ...DEFAULT_MAP_CENTER } },
    milestoneIds: [],
    opportunityIds: [],
    mediaIds: [],
    requiresOpportunities: false,
  };
}

export default function PoliticianProjectsPage() {
  const { leader } = usePoliticianProfile();
  const {
    getProjectsByIds,
    upsertProject,
    deleteProject,
    upsertMilestone,
    getMilestonesByProject,
    content,
  } = useContent();
  const [editing, setEditing] = useState<Project | null>(null);
  const { saving, error, setError, notice, setNotice, run, remove } = useSaveAction();

  const open = (project: Project) => {
    setError("");
    setEditing(project);
  };

  const projects = useMemo(
    () => (leader ? getProjectsByIds(leader.projectIds) : []),
    [leader, getProjectsByIds]
  );

  if (!leader) return null;

  const save = async (seedMilestones = false) => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Give the project a name.");
      return;
    }
    const saved = {
      ...editing,
      slug: editing.slug || slugify(editing.name),
      progress: Math.max(0, Math.min(100, Number(editing.progress) || 0)),
      leaderIds: Array.from(new Set([...editing.leaderIds, leader.id])),
    };
    // One save at a time: a new project's client id is not a Tracker uuid, so a
    // second PUT would create a second project.
    const result = await run(async () => {
      const stored = await upsertProject(saved);
      if (!stored.ok || !seedMilestones || saved.milestoneIds.length) return stored;
      // The server links the project to its leaders. On the Tracker a new project gets a new id.
      const projectId = stored.item?.id ?? saved.id;
      const titles = [
        "Planning",
        "Funding",
        "Construction",
        "Implementation",
        "Completion",
      ];
      const seeded = await Promise.all(
        titles.map((title, i) =>
          upsertMilestone({
            id: createId("ms"),
            projectId,
            number: i + 1,
            date: saved.startDate,
            title,
            description: `${title} stage for ${saved.name}`,
            status: i === 0 ? "current" : "upcoming",
          })
        )
      );
      const failures = seeded.flatMap((r, i) =>
        r.ok ? [] : [`Milestone "${titles[i]}" was not added: ${r.error}`]
      );
      return failures.length
        ? { ...stored, warnings: [...(stored.warnings ?? []), ...failures] }
        : stored;
    });
    if (result?.ok) setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Projects"
        description="Publish development work with status, progress, GIS location and milestones."
        action={
          <Button
            type="button"
            onClick={() => open(emptyProject(leader.id))}
          >
            Add project
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

      <AdminTable headers={["Name", "Status", "Progress", "Milestones", "Opportunities", ""]}>
        {projects.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 max-w-[220px]">
              <p className="truncate text-ink">{p.name}</p>
              <p className="truncate text-caption text-ink-subtle">{p.location}</p>
            </td>
            <td className="px-4 py-3 text-ink-muted">
              {PROJECT_STATUS_LABELS[p.status]}
            </td>
            <td className="px-4 py-3 font-mono text-accent">{p.progress}%</td>
            <td className="px-4 py-3">
              <Button href={`/dashboard/milestones?project=${encodeURIComponent(p.id)}`} size="sm" variant="ghost">
                {getMilestonesByProject(p.id).length} · Manage
              </Button>
            </td>
            <td className="px-4 py-3 text-ink-muted whitespace-nowrap">
              <span className="font-mono">{p.opportunityIds.length}</span>
              {p.requiresOpportunities && (
                <span className="ml-2 rounded-sm border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                  Hiring
                </span>
              )}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button
                href={`/projects/${p.slug}`}
                size="sm"
                variant="ghost"
              >
                View
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => open(structuredClone(p))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (!confirm(`Delete ${p.name}?`)) return;
                  // The server removes the milestones (memory mode) or the
                  // database cascades them (Tracker), and only once the project
                  // delete is allowed (a project with donations is refused).
                  void remove(() => deleteProject(p.id));
                }}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </AdminTable>

      {!projects.length && (
        <p className="mt-4 text-small text-ink-muted">
          No projects linked to your profile yet.
        </p>
      )}

      <AdminDrawer
        open={!!editing}
        title={editing?.name ? "Edit project" : "New project"}
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        footer={
          <div className="flex flex-col gap-2">
            {error && <AdminNotice messages={error} />}
            {editing && !editing.milestoneIds.length && (
              <Button type="button" variant="outline" fullWidth disabled={saving} onClick={() => void save(true)}>
                Save + add standard milestones
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" fullWidth disabled={saving} onClick={() => void save(false)}>
                {saving ? "Saving…" : "Save"}
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
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <AdminField label="Name">
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
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Category">
                <AdminSelect
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: e.target.value as ProjectCategory,
                    })
                  }
                >
                  <option value="infrastructure">Infrastructure</option>
                  <option value="non-infrastructure">Non-Infrastructure</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="Status">
                <AdminSelect
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as ProjectStatus,
                    })
                  }
                >
                  <option value="planned">Planned</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On Hold</option>
                </AdminSelect>
              </AdminField>
            </div>
            <ProjectCategoryField project={editing} onChange={setEditing} />
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
            <AdminField label="Progress %">
              <AdminInput
                type="number"
                min={0}
                max={100}
                value={editing.progress}
                onChange={(e) =>
                  setEditing({ ...editing, progress: Number(e.target.value) })
                }
              />
            </AdminField>
            {/* A start date in the future keeps a published project "Planned". */}
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Start date">
                <AdminInput
                  type="date"
                  value={editing.startDate}
                  onChange={(e) =>
                    setEditing({ ...editing, startDate: e.target.value })
                  }
                />
              </AdminField>
              <AdminField label="Expected completion">
                <AdminInput
                  type="date"
                  min={editing.startDate || undefined}
                  value={editing.expectedCompletion}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      expectedCompletion: e.target.value,
                    })
                  }
                />
              </AdminField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Latitude">
                <AdminInput
                  type="number"
                  step="any"
                  value={editing.geo.center?.lat ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      geo: {
                        ...editing.geo,
                        center: {
                          ...(editing.geo.center ?? DEFAULT_MAP_CENTER),
                          lat: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </AdminField>
              <AdminField label="Longitude">
                <AdminInput
                  type="number"
                  step="any"
                  value={editing.geo.center?.lng ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      geo: {
                        ...editing.geo,
                        center: {
                          ...(editing.geo.center ?? DEFAULT_MAP_CENTER),
                          lng: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </AdminField>
            </div>
            <CoordinatePickerMap
              key={editing.id}
              center={editing.geo.center ?? DEFAULT_MAP_CENTER}
              label={editing.name || editing.location || "Project location"}
              onChange={(point) =>
                setEditing({
                  ...editing,
                  geo: { ...editing.geo, center: point },
                })
              }
            />
            <ImageField
              label="Project image"
              value={editing.image}
              onChange={(image) => setEditing({ ...editing, image })}
              hint="Hero image for this project. Paste a URL or upload from this device."
            />
            <AdminField label="Description">
              <AdminTextarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </AdminField>

            <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[rgb(var(--color-accent))]"
                  checked={Boolean(editing.requiresOpportunities)}
                  onChange={(e) =>
                    setEditing({ ...editing, requiresOpportunities: e.target.checked })
                  }
                />
                <span>
                  <span className="block text-small font-medium text-ink">
                    This project requires opportunities
                  </span>
                  <span className="block text-caption text-ink-muted">
                    Workers, suppliers, contractors, trainees or partners. Linked opportunities
                    appear on the project page, and citizens can apply for them.
                  </span>
                </span>
              </label>
              {(() => {
                const linked = content.opportunities.filter((o) => o.projectId === editing.id);
                const isSaved = leader.projectIds.includes(editing.id);
                if (!editing.requiresOpportunities && linked.length === 0) return null;
                return (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="meta-label">Linked opportunities ({linked.length})</p>
                    {linked.length > 0 && (
                      <ul className="space-y-1.5">
                        {linked.map((o) => (
                          <li key={o.id} className="flex items-center justify-between gap-2 text-small">
                            <span className="truncate text-ink">{o.title}</span>
                            <span className="shrink-0 text-caption text-ink-subtle">
                              {OPPORTUNITY_CATEGORY_LABELS[o.category]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isSaved ? (
                      <Button
                        href={`/dashboard/opportunities?project=${encodeURIComponent(editing.id)}`}
                        size="sm"
                        variant="outline"
                      >
                        Add opportunity for this project
                      </Button>
                    ) : (
                      <p className="text-caption text-ink-subtle">
                        Save the project first, then add its opportunities.
                      </p>
                    )}
                  </div>
                );
              })()}
            </section>

            {leader.projectIds.includes(editing.id) && (
              <Button
                href={`/dashboard/milestones?project=${encodeURIComponent(editing.id)}`}
                size="sm"
                variant="ghost"
              >
                Manage milestones ({getMilestonesByProject(editing.id).length})
              </Button>
            )}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
