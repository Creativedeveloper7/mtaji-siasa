"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Star, Trash2, Upload } from "lucide-react";
import { AdminInput } from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { uploadPhoto } from "@/lib/image-upload";

/** Gallery photos are a little smaller than covers so a full set stays light to load. */
const GALLERY_OPTIONS = { maxDimension: 1280, quality: 0.78, keepPng: false };

/**
 * Pick several photos at once (or paste URLs). The first photo is the cover.
 * Photos can be reordered, promoted to cover, or removed.
 */
export function MultiImageField({
  label,
  value,
  onChange,
  max = 12,
  hint = "Upload several photos at once. The first photo is used as the cover.",
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const room = Math.max(0, max - value.length);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    const picked = files.slice(0, room);
    const skipped = files.length - picked.length;
    const added: string[] = [];
    const failed: string[] = [];
    setProgress({ done: 0, total: picked.length });
    for (const file of picked) {
      try {
        added.push(await uploadPhoto(file, GALLERY_OPTIONS));
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "could not read"}`);
      }
      setProgress({ done: added.length + failed.length, total: picked.length });
    }
    setProgress(null);
    if (added.length) onChange([...value, ...added]);
    const notes = [
      ...failed,
      ...(skipped > 0 ? [`${skipped} photo${skipped === 1 ? "" : "s"} skipped — the limit is ${max}.`] : []),
    ];
    if (notes.length) setError(notes.join(" "));
  };

  const addUrl = () => {
    const next = url.trim();
    if (!next) return;
    if (!/^https?:\/\//i.test(next)) {
      setError("Photo links must start with http:// or https://.");
      return;
    }
    if (room === 0) {
      setError(`You can add up to ${max} photos.`);
      return;
    }
    setError("");
    onChange([...value, next]);
    setUrl("");
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <p className="meta-label">
        {label} ({value.length}/{max})
      </p>
      <div className="space-y-3">
        {value.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface text-ink-subtle transition-colors hover:border-accent/50 hover:text-accent"
          >
            <ImagePlus className="h-8 w-8" aria-hidden />
            <span className="text-caption">Choose photos from this device</span>
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {value.map((src, index) => (
              <li
                key={`${index}-${src.slice(-24)}`}
                className="group relative overflow-hidden rounded-md border border-border bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-inverse">
                    Cover
                  </span>
                )}
                <div className="flex items-center justify-between gap-1 border-t border-border bg-bg-elevated px-1 py-1">
                  <div className="flex">
                    <IconButton label="Move left" disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Move right"
                      disabled={index === value.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </IconButton>
                    {index !== 0 && (
                      <IconButton label="Make cover" onClick={() => move(index, 0)}>
                        <Star className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </div>
                  <IconButton
                    label="Remove photo"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(progress) || room === 0}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {progress
              ? `Uploading ${progress.done}/${progress.total}…`
              : value.length
                ? "Add more photos"
                : "Upload photos"}
          </Button>
          {value.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>
              <Trash2 className="h-4 w-4" />
              Remove all
            </Button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={onFiles}
        />

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <AdminInput
              value={url}
              placeholder="…or paste a photo link https://…"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
              className="pl-9"
              aria-label={`${label} link`}
            />
          </div>
          <Button type="button" size="md" variant="secondary" onClick={addUrl} disabled={!url.trim()}>
            Add
          </Button>
        </div>

        {error && (
          <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error">
            {error}
          </p>
        )}
        {hint && <p className="text-caption text-ink-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
