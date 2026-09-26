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
import { CoordinatePickerMap } from "@/components/gis/CoordinatePickerMap";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Project, ProjectCategory, ProjectStatus } from "@/types";
import { COUNTIES, PROJECT_STATUS_LABELS } from "@/lib/constants";

function emptyProject(leaderId: string): Project {
  return {
    id: createId("prj"),
    slug: "",
    name: "",
    category: "infrastructure",
    subcategory: "Road Rehabilitation",
    location: "",
    county: "Nairobi",
    status: "planned",
    progress: 0,
    image:
      "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1400&q=80",
    description: "",
    startDate: new Date().toISOString().slice(0, 10),
    expectedCompletion: new Date().toISOString().slice(0, 10),
    leaderIds: [leaderId],
    geo: { center: { lat: -1.2864, lng: 36.8172 } },
    milestoneIds: [],
    opportunityIds: [],
    mediaIds: [],
  };
}

export default function PoliticianProjectsPage() {
  const { leader } = usePoliticianProfile();
  const {
    getProjectsByIds,
    upsertProject,
    deleteProject,
    upsertLeader,
    upsertMilestone,
    deleteMilestone,
    getMilestonesByProject,
  } = useContent();
  const [editing, setEditing] = useState<Project | null>(null);

  const projects = useMemo(
    () => (leader ? getProjectsByIds(leader.projectIds) : []),
    [leader, getProjectsByIds]
  );

  if (!leader) return null;

  const linkProject = (project: Project) => {
    const ids = leader.projectIds.includes(project.id)
      ? leader.projectIds
      : [...leader.projectIds, project.id];
    upsertLeader({ ...leader, projectIds: ids });
  };

  const save = (seedMilestones = false) => {
    if (!editing) return;
    const saved = {
      ...editing,
      slug: editing.slug || slugify(editing.name),
      progress: Math.max(0, Math.min(100, Number(editing.progress) || 0)),
      leaderIds: Array.from(new Set([...editing.leaderIds, leader.id])),
    };
    upsertProject(saved);
    linkProject(saved);

    if (seedMilestones && !saved.milestoneIds.length) {
      const titles = [
        "Planning",
        "Funding",
        "Construction",
        "Implementation",
        "Completion",
      ];
      const ids: string[] = [];
      titles.forEach((title, i) => {
        const id = createId("ms");
        ids.push(id);
        upsertMilestone({
          id,
          projectId: saved.id,
          number: i + 1,
          date: saved.startDate,
          title,
          description: `${title} stage for ${saved.name}`,
          status: i === 0 ? "current" : "upcoming",
        });
      });
      upsertProject({ ...saved, milestoneIds: ids });
    }
    setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Projects"
        description="Publish development work with status, progress, GIS location and milestones."
        action={
          <Button
            type="button"
            onClick={() => setEditing(emptyProject(leader.id))}
          >
            Add project
          </Button>
        }
      />

      <AdminTable headers={["Name", "Status", "Progress", "Location", ""]}>
        {projects.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-ink max-w-[220px] truncate">{p.name}</td>
            <td className="px-4 py-3 text-ink-muted">
              {PROJECT_STATUS_LABELS[p.status]}
            </td>
            <td className="px-4 py-3 font-mono text-accent">{p.progress}%</td>
            <td className="px-4 py-3 text-ink-muted max-w-[180px] truncate">
              {p.location}
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
                onClick={() => setEditing(structuredClone(p))}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm(`Delete ${p.name}?`)) return;
                  getMilestonesByProject(p.id).forEach((m) =>
                    deleteMilestone(m.id)
                  );
                  deleteProject(p.id);
                  upsertLeader({
                    ...leader,
                    projectIds: leader.projectIds.filter((id) => id !== p.id),
                  });
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
        onClose={() => setEditing(null)}
        footer={
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" fullWidth onClick={() => save(true)}>
              Save + seed milestones
            </Button>
            <div className="flex gap-2">
              <Button type="button" fullWidth onClick={() => save(false)}>
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
            <AdminField label="Subcategory">
              <AdminInput
                value={editing.subcategory}
                onChange={(e) =>
                  setEditing({ ...editing, subcategory: e.target.value })
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
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Latitude">
                <AdminInput
                  type="number"
                  step="any"
                  value={editing.geo.center.lat}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      geo: {
                        ...editing.geo,
                        center: {
                          ...editing.geo.center,
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
                  value={editing.geo.center.lng}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      geo: {
                        ...editing.geo,
                        center: {
                          ...editing.geo.center,
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
              center={editing.geo.center}
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
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
