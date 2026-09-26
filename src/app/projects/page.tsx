"use client";

import { useMemo, useState } from "react";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { PageHeader } from "@/components/project/ProjectHero";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterBar } from "@/components/ui/FilterBar";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { COUNTIES } from "@/lib/constants";
import type { ProjectCategory } from "@/types";
import { useContent } from "@/components/content/ContentProvider";

export default function ProjectsPage() {
  const { content, ready } = useContent();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [county, setCounty] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return content.projects.filter((p) => {
      const q = query.toLowerCase().trim();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q);
      const matchesCategory =
        category === "all" || p.category === (category as ProjectCategory);
      const matchesCounty = county === "all" || p.county === county;
      const matchesStatus = status === "all" || p.status === status;
      return matchesQuery && matchesCategory && matchesCounty && matchesStatus;
    });
  }, [content.projects, query, category, county, status]);

  if (!ready) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track public development with status, location and progress — infrastructure and community programmes alike."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["infrastructure", "Infrastructure"],
                ["non-infrastructure", "Non-Infrastructure"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`h-9 rounded-md border px-3 text-small transition-colors ${
                  category === value
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border text-ink-muted hover:border-border-strong hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search projects…"
          />
          <FilterBar
            filters={[
              {
                id: "county",
                label: "County",
                value: county,
                onChange: setCounty,
                options: [
                  { value: "all", label: "All counties" },
                  ...COUNTIES.map((c) => ({ value: c, label: c })),
                ],
              },
              {
                id: "status",
                label: "Status",
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "planned", label: "Planned" },
                  { value: "in-progress", label: "In Progress" },
                  { value: "completed", label: "Completed" },
                  { value: "on-hold", label: "On Hold" },
                ],
              },
            ]}
          />
        </div>
      </PageHeader>

      <section className="container-wide section-y-sm">
        {filtered.length === 0 ? (
          <EmptyState
            title="No projects match"
            description="Try a different category, county or search term."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
