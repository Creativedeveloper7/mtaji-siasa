"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    id: "about",
    label: "About",
    title: "About this project",
    body: "An illustrative look at how a public housing project can bring its location, story and progress into one clear view.",
  },
  {
    id: "gis",
    label: "GIS",
    title: "See it on the map",
    body: "The project footprint and surrounding neighbourhood appear together in the GIS view above. Open the live app to explore mapped projects.",
    link: { href: "/projects", label: "Open live map" },
  },
  {
    id: "opportunities",
    label: "Opportunities",
    title: "Opportunity pathways",
    body: "Projects can connect people to jobs, skills training, local supply and creative work.",
    link: { href: "/opportunities", label: "Explore live opportunities" },
  },
  {
    id: "media",
    label: "Media",
    title: "See the progress",
    body: "Project photos, visualizations and progress videos help communities follow the work as it develops.",
    link: { href: "/media", label: "Explore live media" },
  },
  {
    id: "milestones",
    label: "Milestones",
    title: "From plan to delivery",
    body: "Follow each stage of a project, from preparation and construction through to completion.",
    link: { href: "/projects", label: "Explore live projects" },
  },
] as const;

const facts = [
  { value: "Housing", label: "Project type" },
  { value: "Nairobi", label: "Location" },
  { value: "In progress", label: "Status" },
];

const milestones = [
  { label: "Site preparation", state: "Complete" },
  { label: "Foundations", state: "Complete" },
  { label: "Structural works", state: "In progress" },
  { label: "Completion", state: "Upcoming" },
] as const;

const PROGRESS = 42;

const textLink =
  "inline-flex items-center gap-2 text-caption font-bold text-ink transition-colors hover:text-accent";

export function HomeProjectPreview() {
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("about");
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div
      className="border border-border bg-surface shadow-[0_18px_48px_rgba(30,24,16,0.12)]"
      aria-label="Illustrative project page preview"
      role="group"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
        <span className="inline-flex items-center gap-2 text-[13px] font-extrabold text-ink">
          <span className="relative h-5 w-5 overflow-hidden rounded bg-black">
            <Image src="/mtaji-logo.png" alt="" fill className="object-cover" sizes="20px" />
          </span>
          M-TAJI SIASA
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted">
          Illustrative project page
        </span>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-6 pt-7 sm:flex-row sm:items-start sm:justify-between md:px-8">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-green">
            Project / Affordable housing
          </p>
          <h3 className="mt-2 text-[1.75rem] font-extrabold leading-tight text-ink md:text-[2.1rem]">
            Mukuru Boma Yangu
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Mukuru, Nairobi, Kenya
            <span aria-hidden>·</span>
            Affordable housing
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start bg-bg-soft px-3 py-2 text-[10px] font-extrabold uppercase text-brand-green">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-green" aria-hidden />
          In progress
        </span>
      </div>

      <div className="grid gap-6 px-5 pb-6 md:px-8 md:pb-8 lg:grid-cols-[1fr_minmax(0,0.45fr)]">
        <div className="min-w-0">
          <figure className="relative aspect-[1156/966] overflow-hidden bg-bg-elevated sm:aspect-[16/9]">
            <Image
              src="/home/mukuru-project-preview.jpg"
              alt="Illustrative GIS view of the Mukuru affordable housing project site in Nairobi"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
            <span className="image-label absolute bottom-3 left-3">Illustrative GIS visual</span>
          </figure>

          <div
            role="tablist"
            aria-label="Project page preview sections"
            className="card-carousel flex overflow-x-auto border-b border-border"
          >
            {tabs.map((t) => {
              const selected = t.id === active;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`preview-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls="preview-tabpanel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(t.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const i = tabs.findIndex((x) => x.id === t.id);
                    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                    setActive(next.id);
                    document.getElementById(`preview-tab-${next.id}`)?.focus();
                  }}
                  className={cn(
                    "h-12 shrink-0 border-b-[3px] px-4 text-caption font-bold transition-colors",
                    selected
                      ? "border-accent text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id="preview-tabpanel"
            aria-labelledby={`preview-tab-${tab.id}`}
            className="px-1 pb-1 pt-6"
          >
            <h4 className="text-body font-extrabold text-ink">{tab.title}</h4>
            <p className="mt-2 max-w-xl text-small leading-relaxed text-ink-muted">{tab.body}</p>
            {tab.id === "about" ? (
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {facts.map((f) => (
                  <div key={f.label} className="flex flex-col-reverse gap-0.5">
                    <dt className="text-[11px] text-ink-muted">{f.label}</dt>
                    <dd className="text-small font-bold text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Link href={tab.link.href} className={`${textLink} mt-4`}>
                {tab.link.label}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-3" aria-label="Illustrative project summary">
          <div className="border border-border p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-brand-green">
                Project progress
              </span>
              <strong className="text-[1.6rem] font-bold text-ink">{PROGRESS}%</strong>
            </div>
            <div
              className="mt-3 h-[7px] overflow-hidden rounded-md bg-border"
              role="progressbar"
              aria-label="Project progress"
              aria-valuenow={PROGRESS}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-brand-green" style={{ width: `${PROGRESS}%` }} />
            </div>
            <p className="mt-3 text-[10px] text-ink-muted">Visual example · Not live project data</p>
          </div>

          <div className="border border-border p-5">
            <h4 className="text-body font-extrabold text-ink">Milestones</h4>
            <ul className="mt-2">
              {milestones.map((m) => (
                <li
                  key={m.label}
                  className="flex items-center gap-2 border-b border-border py-2 text-[11px] font-bold text-ink last:border-b-0"
                >
                  {m.state === "Complete" ? (
                    <Check className="h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 rounded-full border-2",
                        m.state === "In progress" ? "border-accent" : "border-border-strong"
                      )}
                    />
                  )}
                  <span className="flex-1">{m.label}</span>
                  <span className="text-[10px] font-medium text-ink-muted">{m.state}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-border bg-bg-soft p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-green">
              Opportunities
            </p>
            <h4 className="mt-2 text-body font-extrabold text-ink">Work that opens doors.</h4>
            <p className="mt-2 text-caption leading-relaxed text-ink-muted">
              Discover jobs, training and local supply linked to public projects.
            </p>
            <Link href="/opportunities" className={`${textLink} mt-4`}>
              See live opportunities
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
