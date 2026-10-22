"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import { CoordinatePickerMap } from "@/components/gis/CoordinatePickerMap";
import { ProjectCategoryField } from "@/components/admin/ProjectCategoryField";
import { DEFAULT_MAP_CENTER } from "@/lib/projects";
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
import type { Project, ProjectCategory, ProjectStatus } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";
import { COUNTIES, PROJECT_STATUS_LABELS } from "@/lib/constants";

const emptyProject = (): Project => ({
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
  leaderIds: [],
  geo: { center: { ...DEFAULT_MAP_CENTER } },
  milestoneIds: [],
  opportunityIds: [],
  mediaIds: [],
});

export default function AdminProjectsPage() {
  const {
    content,
    ready,
    upsertProject,
    deleteProject,
    getMilestonesByProject,
    upsertMilestone,
    deleteMilestone,
  } = useContent();
  const [editing, setEditing] = useState<Project | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.projects.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
    );
  }, [content.projects, query]);

  if (!ready) return <LoadingState />;

  /** Saves the project; returns its stored id (a new Tracker project gets a new uuid), or null on error. */
  const persist = async (project: Project): Promise<string | null> => {
    const result = await upsertProject({
      ...project,
      slug: project.slug || slugify(project.name),
      progress: Math.max(0, Math.min(100, Number(project.progress) || 0)),
    });
    if (!result.ok) {
      alert(result.error);
      return null;
    }
    if (result.warnings?.length) alert(result.warnings.join("\n"));
    return result.item?.id ?? project.id;
  };

  const save = async () => {
    if (!editing) return;
    if ((await persist(editing)) !== null) setEditing(null);
  };

  const addDefaultMilestones = (project: Project) => {
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
        projectId: project.id,
        number: i + 1,
        date: project.startDate,
        title,
        description: `${title} stage for ${project.name}`,
        status: i === 0 ? "current" : "upcoming",
      });
    });
  };

  return (
    <div>
      <AdminHeader
        title="Projects"
        description="Manage development projects, GIS coordinates, status and progress."
        action={
          <Button type="button" onClick={() => setEditing(emptyProject())}>
            Add project
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <AdminInput
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <AdminTable
        headers={["Name", "County", "Status", "Progress", "Leaders", ""]}
      >
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-ink max-w-[240px] truncate">{p.name}</td>
            <td className="px-4 py-3 text-ink-muted">{p.county}</td>
            <td className="px-4 py-3 text-ink-muted">
              {PROJECT_STATUS_LABELS[p.status]}
            </td>
            <td className="px-4 py-3 font-mono text-accent">{p.progress}%</td>
            <td className="px-4 py-3 font-mono text-ink-subtle">
              {p.leaderIds.length}
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
                  if (confirm(`Delete ${p.name}?`)) {
                    getMilestonesByProject(p.id).forEach((m) =>
                      deleteMilestone(m.id)
                    );
                    deleteProject(p.id);
                  }
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
        title={editing?.name ? `Edit project` : "New project"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex flex-col gap-2">
            {editing && (
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={async () => {
                  const id = await persist(editing);
                  if (id === null) return;
                  if (!editing.milestoneIds.length) addDefaultMilestones({ ...editing, id });
                  setEditing(null);
                }}
              >
                Save + seed milestones
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" fullWidth onClick={save}>
                Save project
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
            <AdminField label="Slug">
              <AdminInput
                value={editing.slug}
                onChange={(e) =>
                  setEditing({ ...editing, slug: slugify(e.target.value) })
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
                  setEditing({
                    ...editing,
                    progress: Number(e.target.value),
                  })
                }
              />
            </AdminField>
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
            />
            <AdminField label="Description">
              <AdminTextarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Leader IDs (comma-separated)">
              <AdminInput
                value={editing.leaderIds.join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    leaderIds: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </AdminField>
            <p className="text-caption text-ink-subtle">
              Milestones linked: {editing.milestoneIds.length}. Use “Save + seed
              milestones” for a horizontal Planning→Completion track.
            </p>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
