"use client";

import { AdminField, AdminSelect } from "@/components/admin/AdminUI";
import { TRACKER_PROJECT_CATEGORIES, categoryBucket } from "@/lib/projects";
import type { Project } from "@/types";

/**
 * Project type picker over the Tracker's category list. Choosing a type also
 * sets the infrastructure / non-infrastructure bucket it belongs to.
 */
export function ProjectCategoryField({
  project,
  onChange,
}: {
  project: Project;
  onChange: (next: Project) => void;
}) {
  const known = TRACKER_PROJECT_CATEGORIES.some((c) => c.value === project.subcategory);
  return (
    <AdminField label="Project type">
      <AdminSelect
        value={project.subcategory}
        onChange={(e) =>
          onChange({ ...project, subcategory: e.target.value, category: categoryBucket(e.target.value) })
        }
      >
        {!known && project.subcategory && <option value={project.subcategory}>{project.subcategory}</option>}
        {TRACKER_PROJECT_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </AdminSelect>
    </AdminField>
  );
}
