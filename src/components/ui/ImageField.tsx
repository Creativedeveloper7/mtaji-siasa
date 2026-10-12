"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Link2, Trash2, Upload } from "lucide-react";
import { AdminField, AdminInput } from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { uploadPhoto } from "@/lib/image-upload";

export function ImageField({
  label,
  value,
  onChange,
  hint = "Paste a URL or upload a photo from this device.",
  optional = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  optional?: boolean;
  className?: string;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      onChange(await uploadPhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminField label={label} hint={hint}>
      <div className={cn("space-y-3", className)}>
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 text-ink-subtle">
              <ImagePlus className="h-8 w-8" aria-hidden />
              <span className="text-caption">No image yet</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload from device"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setError("");
                onChange("");
              }}
            >
              <Trash2 className="h-4 w-4" />
              {optional ? "Remove" : "Clear"}
            </Button>
          )}
        </div>

        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={onFile}
        />

        <div className="relative">
          <Link2
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <AdminInput
            value={value.startsWith("data:") ? "" : value}
            placeholder={
              value.startsWith("data:")
                ? "Uploaded from device (or paste a new URL)"
                : "https://…"
            }
            onChange={(e) => {
              setError("");
              onChange(e.target.value);
            }}
            className="pl-9"
            aria-label={`${label} URL`}
          />
        </div>

        {value.startsWith("data:") && (
          <p className="text-caption text-ink-subtle">
            Using a photo selected from this device.
          </p>
        )}
        {error && (
          <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error">
            {error}
          </p>
        )}
      </div>
    </AdminField>
  );
}
