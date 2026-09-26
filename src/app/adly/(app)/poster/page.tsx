"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader, AdminField, AdminInput, AdminSelect, AdminTextarea } from "@/components/admin/AdminUI";
import { AdlyStep } from "@/components/adly/AdlyUI";
import { OwnedLeaderField } from "@/components/adly/OwnedLeaderField";
import { useOwnedLeaderScope } from "@/components/adly/useOwnedLeaderScope";
import { useAdly } from "@/components/adly/AdlyProvider";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import { POSTER_TYPES } from "@/data/adly";
import { mockCreativeGenerationService } from "@/lib/services/adly";
import { createId } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Poster, PosterFormat, PosterType } from "@/types/adly";

const FORMATS: { id: PosterFormat; label: string }[] = [
  { id: "1080x1350", label: "1080 × 1350" },
  { id: "1080x1080", label: "1080 × 1080" },
  { id: "1920x1080", label: "1920 × 1080" },
];

export default function AdlyPosterPage() {
  const { content, upsertPoster } = useAdly();
  const {
    leaders,
    leader: ownedLeader,
    leaderId: ownedLeaderId,
    projects,
    isAdmin,
  } = useOwnedLeaderScope();
  const [leaderId, setLeaderId] = useState(ownedLeaderId);
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<PosterType>("campaign");
  const [format, setFormat] = useState<PosterFormat>("1080x1350");
  const [headline, setHeadline] = useState("See the work. Shape the future.");
  const [supporting, setSupporting] = useState(
    "Development you can verify — with GIS evidence on M-Taji Siasa."
  );
  const [cta, setCta] = useState("Explore the project");
  const [date, setDate] = useState("2026");
  const [location, setLocation] = useState("Kiambu County");
  const [portrait, setPortrait] = useState(
    ownedLeader?.photo ||
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80"
  );
  const [projectImage, setProjectImage] = useState(
    "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80"
  );
  const [logo, setLogo] = useState("");
  const [concepts, setConcepts] = useState<Poster["concepts"]>([]);
  const [selected, setSelected] = useState<string>("");
  const [savedId, setSavedId] = useState("");

  useEffect(() => {
    if (!ownedLeaderId) return;
    setLeaderId(ownedLeaderId);
    if (ownedLeader?.photo) setPortrait(ownedLeader.photo);
    if (ownedLeader?.county) setLocation(`${ownedLeader.county} County`);
  }, [ownedLeaderId, ownedLeader]);

  const leader = leaders.find((l) => l.id === leaderId) || ownedLeader;
  const scopedProjects = useMemo(() => {
    if (!leaderId) return [];
    const profile = leaders.find((l) => l.id === leaderId);
    if (!profile) return [];
    const owned = new Set(profile.projectIds);
    return projects.filter((p) => owned.has(p.id));
  }, [leaderId, leaders, projects]);

  const myPosters = useMemo(() => {
    if (isAdmin) return content.posters;
    if (!leaderId) return [];
    return content.posters.filter((p) => p.leaderId === leaderId);
  }, [content.posters, isAdmin, leaderId]);

  const generate = async () => {
    const next = await mockCreativeGenerationService.generatePosterConcepts({});
    setConcepts(next);
    setSelected(next[0]?.id || "");
  };

  const save = () => {
    if (!leaderId) return;
    const id = createId("pst");
    upsertPoster({
      id,
      name: headline.slice(0, 48) || "Untitled poster",
      leaderId,
      projectId: projectId || undefined,
      type,
      format,
      headline,
      supporting,
      cta,
      date,
      location,
      portrait,
      projectImage,
      logo: logo || undefined,
      concepts,
      selectedConceptId: selected,
      createdAt: new Date().toISOString(),
    });
    setSavedId(id);
  };

  const aspect =
    format === "1080x1080"
      ? "aspect-square"
      : format === "1920x1080"
        ? "aspect-video"
        : "aspect-[4/5]";

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Create a campaign poster"
        description="Editable design compositions for political and development storytelling — premium, not flyer clutter."
        action={
          <Button href="/adly/advertising" variant="outline" size="sm">
            Advertise this
          </Button>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <AdlyStep n={1} title="Your profile">
            <OwnedLeaderField
              leaders={leaders}
              leaderId={leaderId}
              isAdmin={isAdmin}
              onChange={(id) => {
                setLeaderId(id);
                setProjectId("");
                const l = leaders.find((x) => x.id === id);
                if (l) {
                  setPortrait(l.photo);
                  setLocation(`${l.county} County`);
                }
              }}
            />
          </AdlyStep>

          <AdlyStep n={2} title="Choose campaign / project">
            <AdminSelect
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— General campaign —</option>
              {scopedProjects.length === 0 ? (
                <option value="" disabled>
                  No uploaded projects yet — add them in your dashboard
                </option>
              ) : (
                scopedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </AdminSelect>
          </AdlyStep>

          <AdlyStep n={3} title="Poster type">
            <div className="grid gap-2 sm:grid-cols-2">
              {POSTER_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-small",
                    type === t.id
                      ? "border-accent/40 bg-accent-soft text-ink"
                      : "border-border text-ink-muted hover:border-border-strong"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </AdlyStep>

          <AdlyStep n={4} title="Upload / select imagery">
            <div className="space-y-4">
              <ImageField label="Portrait" value={portrait} onChange={setPortrait} />
              <ImageField
                label="Project image"
                value={projectImage}
                onChange={setProjectImage}
              />
              <ImageField
                label="Logo (optional)"
                value={logo}
                onChange={setLogo}
                optional
              />
            </div>
          </AdlyStep>

          <AdlyStep n={5} title="Copy & format">
            <div className="space-y-4">
              <AdminField label="Headline">
                <AdminInput value={headline} onChange={(e) => setHeadline(e.target.value)} />
              </AdminField>
              <AdminField label="Supporting message">
                <AdminTextarea
                  value={supporting}
                  onChange={(e) => setSupporting(e.target.value)}
                />
              </AdminField>
              <AdminField label="CTA">
                <AdminInput value={cta} onChange={(e) => setCta(e.target.value)} />
              </AdminField>
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Date">
                  <AdminInput value={date} onChange={(e) => setDate(e.target.value)} />
                </AdminField>
                <AdminField label="Location">
                  <AdminInput
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </AdminField>
              </div>
              <AdminField label="Format">
                <AdminSelect
                  value={format}
                  onChange={(e) => setFormat(e.target.value as PosterFormat)}
                >
                  {FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={generate}>
                  Generate concepts
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={save}
                  disabled={!concepts.length}
                >
                  Save poster
                </Button>
              </div>
              {savedId && (
                <p className="text-caption text-success">
                  Saved. Continue to advertising or export later.
                </p>
              )}
            </div>
          </AdlyStep>
        </div>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <p className="meta-label text-accent">Studio preview</p>
          {!concepts.length ? (
            <div
              className={cn(
                "overflow-hidden rounded-lg border border-border bg-bg-elevated",
                aspect
              )}
            >
              <PosterCanvas
                layout="hero-full"
                headline={headline}
                supporting={supporting}
                cta={cta}
                date={date}
                location={location}
                portrait={portrait}
                projectImage={projectImage}
                leaderName={
                  leader ? `${leader.honorific} ${leader.name}` : "Leader"
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {concepts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "block w-full overflow-hidden rounded-lg border text-left transition-colors",
                    selected === c.id
                      ? "border-accent/50 shadow-glow"
                      : "border-border hover:border-border-strong"
                  )}
                >
                  <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
                    <span className="text-caption font-medium text-ink">
                      {c.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
                      {c.layout}
                    </span>
                  </div>
                  <div className={cn("bg-bg-elevated", aspect)}>
                    <PosterCanvas
                      layout={c.layout}
                      headline={headline}
                      supporting={supporting}
                      cta={cta}
                      date={date}
                      location={location}
                      portrait={portrait}
                      projectImage={projectImage}
                      leaderName={
                        leader ? `${leader.honorific} ${leader.name}` : "Leader"
                      }
                      accent={c.accent}
                    />
                  </div>
                </button>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={generate}>
                  Regenerate
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={save}>
                  Duplicate & save
                </Button>
                <Button href="/adly/advertising" size="sm">
                  Create campaign
                </Button>
              </div>
            </div>
          )}

          {myPosters.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="meta-label">Saved posters</p>
              <ul className="mt-3 space-y-2">
                {myPosters.map((p) => (
                  <li key={p.id} className="text-small text-ink-muted">
                    {p.name} · {p.format}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PosterCanvas({
  layout,
  headline,
  supporting,
  cta,
  date,
  location,
  portrait,
  projectImage,
  leaderName,
  accent = "#e5b12a",
}: {
  layout: "hero-left" | "hero-full" | "split" | "minimal";
  headline: string;
  supporting: string;
  cta: string;
  date: string;
  location: string;
  portrait: string;
  projectImage: string;
  leaderName: string;
  accent?: string;
}) {
  if (layout === "split") {
    return (
      <div className="grid h-full grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={projectImage} alt="" className="h-full w-full object-cover" />
        <div className="flex flex-col justify-between bg-[#111] p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portrait}
            alt=""
            className="h-20 w-20 rounded-md object-cover"
          />
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/50">
              {leaderName}
            </p>
            <p className="mt-2 font-serif text-xl italic text-white">{headline}</p>
            <p className="mt-2 text-[11px] text-white/60">{supporting}</p>
            <p className="mt-4 text-[10px] font-medium" style={{ color: accent }}>
              {cta} →
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "minimal") {
    return (
      <div className="relative flex h-full flex-col justify-end bg-[#0c0c0c] p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portrait}
          alt=""
          className="absolute right-4 top-4 h-24 w-24 rounded-full object-cover opacity-90"
        />
        <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: accent }}>
          {location} · {date}
        </p>
        <p className="mt-3 max-w-[90%] text-2xl font-medium leading-tight text-white">
          {headline}
        </p>
        <p className="mt-3 max-w-[85%] text-xs text-white/55">{supporting}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={projectImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="mb-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portrait}
            alt=""
            className="h-12 w-12 rounded-md border border-white/20 object-cover"
          />
          <p className="text-[10px] uppercase tracking-[0.1em] text-white/70">
            {leaderName}
          </p>
        </div>
        <p className="text-xl font-medium leading-snug text-white md:text-2xl">
          {headline}
        </p>
        <p className="mt-2 text-xs text-white/65">{supporting}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span
            className="rounded-sm px-2.5 py-1 text-[10px] font-medium text-black"
            style={{ background: accent }}
          >
            {cta}
          </span>
          <span className="text-[10px] text-white/45">
            {location} · {date}
          </span>
        </div>
      </div>
    </div>
  );
}
