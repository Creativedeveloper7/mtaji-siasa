"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, ImageOff, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { AdImageCheck, AdPolicyFinding, AdPolicyReview } from "@/types";

/** The ad as the owner approved it from Adly's review. */
export interface ApprovedAdlyVersion {
  headline: string;
  body: string;
  keywords: string[];
  imageUrl: string;
  /** What Adly changed and why, shown again for the final confirmation */
  changes: AdPolicyFinding[];
}

const FIELD_LABEL: Record<AdPolicyFinding["field"], string> = {
  headline: "Headline",
  body: "Ad text",
  keywords: "Keywords",
  image: "Photo",
};

/**
 * Adly's X policy review: what X would likely reject, why, and the version
 * Adly made. The owner approves it (and may pick another photo) or goes back
 * to edit; nothing is published from here.
 */
export function AdlyXReview({
  review,
  canDropX,
  onApprove,
  onEdit,
  onDropX,
}: {
  review: AdPolicyReview;
  /** Google is also selected, so the ad can still run without X */
  canDropX: boolean;
  onApprove: (version: ApprovedAdlyVersion) => void;
  onEdit: () => void;
  onDropX: () => void;
}) {
  const usable = [review.image, ...review.alternatives].filter((i) => i.ok);
  const [imageUrl, setImageUrl] = useState(review.suggested.imageUrl);
  const fixes = review.findings.filter((f) => f.severity === "fix");
  const advice = review.findings.filter((f) => f.severity === "advice");
  const { original, suggested } = review;
  const needsImage = review.status === "needs_image";

  const changed = {
    headline: original.headline !== suggested.headline,
    body: original.body !== suggested.body,
    keywords: original.keywords.join("\n") !== suggested.keywords.join("\n"),
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-bg/75 backdrop-blur-sm" aria-label="Close" onClick={onEdit} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adly-x-review-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-lg border border-border bg-bg-elevated shadow-raised sm:rounded-lg"
      >
        <div className="border-b border-border p-5">
          <p className="meta-label flex items-center gap-1.5 text-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Adly · X policy check
          </p>
          <h2 id="adly-x-review-title" className="mt-1 text-h3 text-ink">
            {needsImage ? "This ad needs a different photo for X" : "Adly changed your ad so X can approve it"}
          </h2>
          <p className="mt-1 text-small text-ink-muted">
            {needsImage
              ? "X would reject the photo, and none of this project's other photos can be used either."
              : "X would likely reject the ad as it is. Here is what Adly changed and why. Nothing is published until you approve and confirm."}
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {fixes.length > 0 && (
            <section>
              <h3 className="meta-label mb-2">Why it was changed</h3>
              <ul className="space-y-2">
                {fixes.map((f, i) => (
                  <li key={i} className="rounded-md border border-warning/30 bg-warning-muted p-3 text-small">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                      {FIELD_LABEL[f.field]}
                      {f.field !== "image" && <span className="font-normal text-ink-muted">“{f.found}”</span>}
                    </p>
                    <p className="mt-1 text-ink-muted">{f.why}</p>
                    {f.change && <p className="mt-1 text-caption text-ink-subtle">{f.change}.</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(changed.headline || changed.body || changed.keywords) && (
            <section>
              <h3 className="meta-label mb-2">Adly&apos;s version</h3>
              <div className="space-y-3">
                {changed.headline && <BeforeAfter label="Headline" before={original.headline} after={suggested.headline} />}
                {changed.body && <BeforeAfter label="Ad text" before={original.body} after={suggested.body} />}
                {changed.keywords && (
                  <BeforeAfter label="Keywords" before={original.keywords.join(", ")} after={suggested.keywords.join(", ")} />
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="meta-label mb-2">Photo</h3>
            {usable.length > 0 ? (
              <>
                <p className="mb-3 text-caption text-ink-muted">
                  {imageUrl === original.imageUrl ? "Your photo can be used." : "Adly picked another photo of this project."} This is how X will
                  show it{usable.length > 1 ? "; tap another to use it instead" : ""}.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {usable.map((image) => (
                    <ImageChoice key={image.url} image={image} selected={image.url === imageUrl} onSelect={() => setImageUrl(image.url)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-error/30 bg-error-muted p-3 text-small text-error">
                <p className="flex items-center gap-2 font-medium">
                  <ImageOff className="h-4 w-4" aria-hidden />
                  No photo of this project can be used on X.
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {review.image.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  <Link href="/dashboard/projects" className="underline">
                    Add a different photo to the project
                  </Link>{" "}
                  (a real photo of the place or the work, at least 600 px wide), then try again.
                </p>
              </div>
            )}
          </section>

          {advice.length > 0 && (
            <section>
              <h3 className="meta-label mb-2">Worth checking</h3>
              <ul className="space-y-1.5 text-caption text-ink-muted">
                {advice.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    <span>{f.why}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-caption text-ink-subtle">
            Adly checks against X&apos;s ad policies{review.checkedBy === "rules+ai" ? " with an AI review of the text and photo" : ""}. X makes
            the final decision.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row">
          <Button type="button" variant="secondary" fullWidth onClick={onEdit}>
            Edit it myself
          </Button>
          {needsImage ? (
            canDropX && (
              <Button type="button" fullWidth onClick={onDropX}>
                Run on Google only
              </Button>
            )
          ) : (
            <Button
              type="button"
              fullWidth
              onClick={() =>
                onApprove({
                  headline: suggested.headline,
                  body: suggested.body,
                  keywords: suggested.keywords,
                  imageUrl,
                  changes: review.findings.filter(
                    (f) => f.severity === "fix" && (f.field !== "image" || imageUrl !== original.imageUrl)
                  ),
                })
              }
            >
              <Check className="h-4 w-4" />
              Approve Adly&apos;s version
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BeforeAfter({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded-md border border-border p-3 text-small">
      <p className="meta-label mb-1.5">{label}</p>
      <p className="text-ink-subtle line-through decoration-ink-subtle/60">{before || "—"}</p>
      <p className="mt-1.5 flex gap-1.5 text-ink">
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>{after}</span>
      </p>
    </div>
  );
}

function ImageChoice({ image, selected, onSelect }: { image: AdImageCheck; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "overflow-hidden rounded-md border text-left transition-colors",
        selected ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview of X's crop */}
      <img src={image.previewDataUrl || image.url} alt="" className="aspect-[1.91/1] w-full object-cover" />
      <span className="block px-2 py-1 text-caption text-ink-muted">
        {selected ? "Using this" : "Use this"}
        {image.willCrop ? " · cropped" : ""}
      </span>
    </button>
  );
}
