"use client";

import { useEffect, useState } from "react";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { createId } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import type { MilestoneStatus, ProjectMilestone } from "@/types";

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  completed: "Completed",
  current: "In progress",
  upcoming: "Upcoming",
};

const STATUS_TONES = {
  completed: "success",
  current: "accent",
  upcoming: "neutral",
} as const;

export default function PoliticianMilestonesPage() {
  const { leader } = usePoliticianProfile();
  const { getProjectsByIds, getMilestonesByProject, upsertMilestone, deleteMilestone } =
    useContent();
  const [projectId, setProjectId] = useState("");
  const [editing, setEditing] = useState<ProjectMilestone | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const projects = leader ? getProjectsByIds(leader.projectIds) : [];
  const firstProjectId = projects[0]?.id ?? "";

  // ?project=<id> (from the Projects page) picks the project; otherwise the first one.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("project");
    setProjectId((current) => current || requested || firstProjectId);
  }, [firstProjectId]);

  if (!leader) return null;

  const project = projects.find((item) => item.id === projectId);
  const milestones = project ? getMilestonesByProject(project.id) : [];

  const startNew = () => {
    if (!project) return;
    setError("");
    setEditing({
      id: createId("ms"),
      projectId: project.id,
      number: milestones.reduce((max, m) => Math.max(max, m.number), 0) + 1,
      date: new Date().toISOString().slice(0, 10),
      title: "",
      description: "",
      status: "upcoming",
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError("Give the milestone a title.");
      return;
    }
    setSaving(true);
    setError("");
    const result = await upsertMilestone({ ...editing, image: editing.image || undefined });
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
        title="Milestones"
        description="Record each stage of a project — planning, funding, construction, handover — with a date, status and photo evidence."
        action={
          <Button type="button" onClick={startNew} disabled={!project}>
            Add milestone
          </Button>
        }
      />

      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-small text-ink-muted">
          Add a project first, then record its milestones here.{" "}
          <Button href="/dashboard/projects" size="sm" variant="outline" className="ml-2">
            Go to projects
          </Button>
        </p>
      ) : (
        <>
          <div className="mb-6 max-w-md">
            <AdminField label="Project">
              <AdminSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>

          {milestones.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-small text-ink-muted">
              No milestones on this project yet. Use “Add milestone” to record the first stage.
            </p>
          ) : (
            <AdminTable headers={["#", "Milestone", "Date", "Status", "Photo", ""]}>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-mono text-ink-muted">{m.number}</td>
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate text-ink">{m.title}</p>
                    {m.description && (
                      <p className="truncate text-caption text-ink-subtle">{m.description}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {m.date ? formatDate(m.date) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={STATUS_LABELS[m.status]} tone={STATUS_TONES[m.status]} />
                  </td>
                  <td className="px-4 py-3">
                    {m.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image} alt="" className="h-10 w-14 rounded object-cover" />
                    ) : (
                      <span className="text-caption text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setError("");
                        setEditing(structuredClone(m));
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!confirm(`Delete milestone “${m.title}”?`)) return;
                        void deleteMilestone(m.id);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
        </>
      )}

      <AdminDrawer
        open={!!editing}
        title={project ? `Milestone · ${project.name}` : "Milestone"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button type="button" fullWidth disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
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
                placeholder="e.g. Foundation and drainage complete"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </AdminField>
            <div className="grid grid-cols-3 gap-3">
              <AdminField label="Order">
                <AdminInput
                  type="number"
                  min={1}
                  value={editing.number}
                  onChange={(e) =>
                    setEditing({ ...editing, number: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </AdminField>
              <div className="col-span-2">
                <AdminField label="Date">
                  <AdminInput
                    type="date"
                    value={editing.date}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  />
                </AdminField>
              </div>
            </div>
            <AdminField label="Status">
              <AdminSelect
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value as MilestoneStatus })
                }
              >
                {(Object.keys(STATUS_LABELS) as MilestoneStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="What happened at this stage">
              <AdminTextarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </AdminField>
            <ImageField
              label="Photo evidence"
              value={editing.image ?? ""}
              onChange={(image) => setEditing({ ...editing, image })}
              optional
              hint="Optional photo of the site at this milestone."
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
