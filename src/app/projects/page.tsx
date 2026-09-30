"use client";

import { useEffect, useMemo, useState } from "react";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { PageHero } from "@/components/layout/PageHero";
import { SectionIntro } from "@/components/layout/SectionIntro";
import { ClosingBand } from "@/components/layout/ClosingBand";
import { SearchBar } from "@/components/ui/SearchBar";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { FilterBar, FilterChips } from "@/components/ui/FilterBar";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { COUNTIES } from "@/lib/constants";
import type { ProjectCategory } from "@/types";
import { useContent } from "@/components/content/ContentProvider";
import { useFaida } from "@/components/faida/FaidaProvider";

const categoryOptions: { value: "all" | ProjectCategory; label: string }[] = [
  { value: "all", label: "All projects" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "non-infrastructure", label: "Community programmes" },
];

export default function ProjectsPage() {
  const { content, ready } = useContent();
  const { openFaida } = useFaida();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ProjectCategory>("all");
  const [county, setCounty] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  const filtered = useMemo(() => {
    return content.projects.filter((p) => {
      const q = query.toLowerCase().trim();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q);
      const matchesCategory = category === "all" || p.category === category;
      const matchesCounty = county === "all" || p.county === county;
      const matchesStatus = status === "all" || p.status === status;
      return matchesQuery && matchesCategory && matchesCounty && matchesStatus;
    });
  }, [content.projects, query, category, county, status]);

  if (!ready) return <LoadingState />;

  const projects = content.projects;
  const inProgress = projects.filter((p) => p.status === "in-progress").length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const counties = new Set(projects.map((p) => p.county)).size;

  return (
    <>
      <PageHero
        eyebrow="Development you can see"
        titleText="Every project. On the map."
        title={
          <>
            Every project.
            <br />
            <em className="script-accent text-accent">On the map.</em>
          </>
        }
        description="Roads, water, health centres and youth programmes. See what is being built in your area, who is behind it, how far it has come and when it should be finished. No jargon, just what is happening on the ground."
        image="/home/project-road.jpg"
        imageAlt="Illustrative aerial view of a road being surfaced through a neighbourhood"
        primary={{ label: "Browse projects", href: "#browse" }}
        secondary={{ label: "See the jobs they create", href: "/opportunities" }}
        stats={[
          { value: projects.length, label: "Projects" },
          { value: inProgress, label: "In progress" },
          { value: completed, label: "Completed" },
          { value: counties, label: "Counties" },
        ]}
        stepsLabel="How to use this page"
        steps={[
          {
            title: "Find a project",
            body: "Search by name or place, or filter by county, type and status.",
          },
          {
            title: "Track the progress",
            body: "Open a project to see where it is, its milestones and how much is done.",
          },
          {
            title: "Find the Kazi",
            body: "Many projects create jobs, training and supply work you can apply for.",
          },
        ]}
      />

      <section id="browse" className="scroll-mt-20 bg-bg py-18 md:py-22">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Proof on the ground"
            title={
              <>
                Find projects{" "}
                <em className="script-accent text-brand-green">near you.</em>
              </>
            }
            body="Every card shows the type of project, where it is and how far it has come. Tap any project to see the full story."
          />

          <div className="space-y-4">
            <FilterChips
              label="Project type"
              value={category}
              options={categoryOptions}
              onChange={setCategory}
            />
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr] lg:items-end">
              <SearchBar
                id="project-search"
                label="Search"
                value={query}
                onChange={setQuery}
                placeholder="Search by project name or place…"
              />
              <FilterBar
                className="sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2"
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
                      { value: "in-progress", label: "In progress" },
                      { value: "completed", label: "Completed" },
                      { value: "on-hold", label: "On hold" },
                    ],
                  },
                ]}
              />
            </div>
          </div>

          <p className="mt-6 text-caption font-bold text-ink" aria-live="polite">
            Showing {filtered.length} of {projects.length} projects
          </p>

          <div className="mt-4">
            {filtered.length === 0 ? (
              <EmptyState
                title="No projects match"
                description="Try a different type, county or search term."
              />
            ) : (
              <CardCarousel key={filtered.map((p) => p.id).join("|")} label="Projects">
                {filtered.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </CardCarousel>
            )}
          </div>
        </div>
      </section>

      <ClosingBand
        eyebrow="M-Taji Faida"
        title={
          <>
            Follow a project{" "}
            <em className="script-accent text-accent">on WhatsApp.</em>
          </>
        }
        body="Connect with M-Taji Faida to get progress updates, ask questions and share feedback on the projects in your area."
        actionLabel="Connect with Faida"
        onAction={() => openFaida("connect")}
      />
    </>
  );
}
