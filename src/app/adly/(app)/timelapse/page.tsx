"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminHeader,
  AdminField,
  AdminInput,
  AdminSelect,
} from "@/components/admin/AdminUI";
import { AdlyStep } from "@/components/adly/AdlyUI";
import { useOwnedLeaderScope } from "@/components/adly/useOwnedLeaderScope";
import { useAdly } from "@/components/adly/AdlyProvider";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { mockVideoRenderService } from "@/lib/services/adly";
import { createId } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";
import type { Timelapse, TimelapseAspect, TimelapseMedia } from "@/types/adly";

export default function AdlyTimelapsePage() {
  const { content, upsertTimelapse } = useAdly();
  const { projects, leaderId, isAdmin } = useOwnedLeaderScope();
  const existing = useMemo(() => {
    if (isAdmin) return content.timelapses[0];
    return content.timelapses.find((t) => {
      const p = projects.find((pr) => pr.id === t.projectId);
      return !!p;
    });
  }, [content.timelapses, projects, isAdmin]);

  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState(existing?.name || "");
  const [aspect, setAspect] = useState<TimelapseAspect>(existing?.aspect || "16:9");
  const [media, setMedia] = useState<TimelapseMedia[]>(existing?.media || []);
  const [playIndex, setPlayIndex] = useState(0);
  const [previewNote, setPreviewNote] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newDate, setNewDate] = useState("2026-01-01");
  const [newPhase, setNewPhase] = useState<TimelapseMedia["phase"]>("during");

  useEffect(() => {
    if (!projects.length) {
      setProjectId("");
      return;
    }
    setProjectId((prev) =>
      prev && projects.some((p) => p.id === prev) ? prev : projects[0].id
    );
  }, [projects]);

  const project = projects.find((p) => p.id === projectId);

  const ordered = useMemo(
    () => [...media].sort((a, b) => a.order - b.order || a.capturedAt.localeCompare(b.capturedAt)),
    [media]
  );

  const current = ordered[playIndex] || ordered[0];

  const addMedia = () => {
    if (!newUrl.trim()) return;
    setMedia((prev) => [
      ...prev,
      {
        id: createId("tlm"),
        type: "image",
        url: newUrl,
        caption: newCaption || "Project media",
        capturedAt: newDate,
        phase: newPhase,
        order: prev.length,
      },
    ]);
    setNewUrl("");
    setNewCaption("");
  };

  const move = (id: string, dir: -1 | 1) => {
    setMedia((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((m) => m.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swap];
      return prev.map((m) => {
        if (m.id === a.id) return { ...m, order: b.order };
        if (m.id === b.id) return { ...m, order: a.order };
        return m;
      });
    });
  };

  const removeMedia = (id: string) => {
    const idx = ordered.findIndex((m) => m.id === id);
    setMedia((prev) =>
      prev.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i }))
    );
    setPlayIndex((current) => {
      if (ordered.length <= 1) return 0;
      if (idx < 0) return current;
      if (current > idx) return current - 1;
      if (current === idx) return Math.min(current, ordered.length - 2);
      return current;
    });
  };

  const save = async () => {
    if (!project) return;
    const item: Timelapse = {
      id: existing?.id || createId("tl"),
      name: title || `${project.name} — Progress Story`,
      projectId: project.id,
      location: project.location,
      startDate: ordered[0]?.capturedAt || project.startDate,
      endDate: ordered[ordered.length - 1]?.capturedAt || project.expectedCompletion,
      progress: project.progress,
      aspect,
      media: ordered,
      milestones: existing?.milestones || ["Planning", "Works", "Completion"],
      captionsEnabled: true,
      brandingEnabled: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    upsertTimelapse(item);
    const render = await mockVideoRenderService.renderTimelapse(item);
    setPreviewNote(render.note);
  };

  const aspectClass =
    aspect === "9:16"
      ? "aspect-[9/16] max-w-sm mx-auto"
      : aspect === "1:1"
        ? "aspect-square max-w-lg mx-auto"
        : "aspect-video";

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Show development over time."
        description="Turn timestamped project imagery and video into compelling development timelines. Preserve original capture context — never imply unrelated media belongs to the project."
        action={
          <Button href="/adly/poster" variant="outline" size="sm">
            Make a poster
          </Button>
        }
      />

      <AdlyStep n={1} title="Select a project">
        <AdminSelect
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            const p = projects.find((x) => x.id === e.target.value);
            if (p) setTitle(`${p.name} — Progress Story`);
          }}
        >
          {projects.length === 0 ? (
            <option value="">No projects on your profile yet</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </AdminSelect>
        {!isAdmin && leaderId && projects.length === 0 && (
          <p className="mt-2 text-caption text-ink-subtle">
            Add projects in your politician dashboard first — only your own work
            appears here.
          </p>
        )}
      </AdlyStep>

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-6">
          <AdlyStep n={2} title="Timeline media">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
              {ordered.map((m, i) => (
                <div
                  key={m.id}
                  className={cn(
                    "relative shrink-0 rounded-md border",
                    playIndex === i
                      ? "border-accent/40 bg-accent-soft"
                      : "border-border bg-bg-elevated"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPlayIndex(i)}
                    className="px-3 py-2 text-left"
                  >
                    <p className="font-mono text-[10px] text-accent">
                      {formatDate(m.capturedAt)}
                    </p>
                    <p className="mt-1 text-caption capitalize text-ink-muted">
                      {m.phase}
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${m.caption || "media"}`}
                    onClick={() => removeMedia(m.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg-elevated text-[10px] text-ink-muted hover:border-error/40 hover:text-error"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <ul className="space-y-2">
              {ordered.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-bg-elevated p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    className="h-14 w-20 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small text-ink">{m.caption}</p>
                    <p className="text-caption text-ink-subtle">
                      {formatDate(m.capturedAt)} · {m.type} · {m.phase}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => move(m.id, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => move(m.id, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete “${m.caption || "this media"}”?`)) {
                          removeMedia(m.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <ImageField label="Add media" value={newUrl} onChange={setNewUrl} />
              <AdminField label="Caption">
                <AdminInput
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                />
              </AdminField>
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Captured at">
                  <AdminInput
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </AdminField>
                <AdminField label="Phase">
                  <AdminSelect
                    value={newPhase}
                    onChange={(e) =>
                      setNewPhase(e.target.value as TimelapseMedia["phase"])
                    }
                  >
                    <option value="before">Before</option>
                    <option value="during">During</option>
                    <option value="after">After</option>
                  </AdminSelect>
                </AdminField>
              </div>
              <Button type="button" variant="outline" onClick={addMedia}>
                Add to timeline
              </Button>
            </div>
          </AdlyStep>

          <AdlyStep n={3} title="Timelapse settings">
            <div className="space-y-4">
              <AdminField label="Project title">
                <AdminInput value={title} onChange={(e) => setTitle(e.target.value)} />
              </AdminField>
              <AdminField label="Aspect ratio">
                <AdminSelect
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as TimelapseAspect)}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </AdminSelect>
              </AdminField>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={save}>
                  Save & preview composition
                </Button>
                <Button href="/adly/advertising" variant="outline">
                  Create campaign
                </Button>
              </div>
              {previewNote && (
                <p className="text-caption text-ink-subtle">{previewNote}</p>
              )}
            </div>
          </AdlyStep>
        </div>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <p className="meta-label text-accent mb-3">Preview player</p>
          <div
            className={cn(
              "relative overflow-hidden rounded-lg border border-border bg-black",
              aspectClass
            )}
          >
            {current ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.url}
                  alt={current.caption}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
                <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-accent">
                    {title || project?.name}
                  </p>
                  <p className="mt-2 text-small text-white/80">
                    {project?.location}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-white/50">
                    {ordered[0] && formatDate(ordered[0].capturedAt)} →{" "}
                    {ordered[ordered.length - 1] &&
                      formatDate(ordered[ordered.length - 1].capturedAt)}
                  </p>
                  {project && (
                    <div className="mt-4 max-w-xs">
                      <ProgressBar value={project.progress} size="sm" />
                      <p className="mt-1 font-mono text-[10px] text-accent">
                        {project.progress}% COMPLETE
                      </p>
                    </div>
                  )}
                  <p className="mt-3 text-caption text-white/70">
                    {current.caption} · captured {formatDate(current.capturedAt)}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-small text-white/40">
                Add timestamped media to preview
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={playIndex <= 0}
              onClick={() => setPlayIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={playIndex >= ordered.length - 1}
              onClick={() =>
                setPlayIndex((i) => Math.min(ordered.length - 1, i + 1))
              }
            >
              Next frame
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
