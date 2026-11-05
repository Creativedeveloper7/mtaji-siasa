"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Check, ImageOff, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AdminInput } from "@/components/admin/AdminUI";
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
  landing: "Project page",
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
  photoLocked = false,
  onApplyLanding,
  onSwitchToGoogle,
}: {
  review: AdPolicyReview;
  /** Google is also selected, so the ad can still run without X */
  canDropX: boolean;
  onApprove: (version: ApprovedAdlyVersion) => void;
  onEdit: () => void;
  onDropX: () => void;
  /** Updating a running ad: the photo stays as it is, so only the text is reviewed here. */
  photoLocked?: boolean;
  /**
   * Save Adly's (or the owner's edited) project page to the project, then
   * check again. Resolves to an error message, or null when it was saved.
   */
  onApplyLanding?: (page: { name: string; description: string }) => Promise<string | null>;
  /** Only X is selected: run the ad on Google instead */
  onSwitchToGoogle?: () => void;
}) {
  const usable = [review.image, ...review.alternatives].filter((i) => i.ok);
  const [imageUrl, setImageUrl] = useState(photoLocked ? review.original.imageUrl : review.suggested.imageUrl);
  // The photo stays in an update, so its notes are left out, except a name that differs from the project's.
  const shown = photoLocked ? review.findings.filter((f) => f.field !== "image" || f.found === "Name on the photo") : review.findings;
  const fixes = shown.filter((f) => f.severity === "fix");
  const advice = shown.filter((f) => f.severity === "advice");
  const { original, suggested } = review;
  const needsImage = review.status === "needs_image" && !photoLocked;
  const notForX = review.status === "not_for_x";
  // Updating a running ad can't change its photo, so a photo X would reject stops the update.
  const photoBlocked = photoLocked && !notForX && !review.image.ok;
  const blocks = review.findings.filter((f) => f.severity === "block");
  const pagePolitical = blocks.some((f) => f.rule === "political");
  const officeTitle = blocks.some((f) => f.rule === "impersonation" && f.change);
  // What the ad promotes, for wording and edit links.
  const isOpportunity = review.landing?.kind === "opportunity" || blocks.some((f) => f.rule === "opportunity");
  const noun = isOpportunity ? "opportunity" : "project";
  const editHref = isOpportunity ? "/dashboard/opportunities" : "/dashboard/projects";
  const [pageName, setPageName] = useState(review.landing?.suggested.name ?? "");
  const [pageText, setPageText] = useState(review.landing?.suggested.description ?? "");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  const applyLanding = async () => {
    if (!onApplyLanding || !pageName.trim() || !pageText.trim()) return;
    setApplying(true);
    setApplyError("");
    const error = await onApplyLanding({ name: pageName.trim(), description: pageText.trim() });
    setApplying(false);
    if (error) setApplyError(error);
  };

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
            {notForX
              ? "X won't run this ad as the project page stands"
              : photoBlocked
                ? "X would reject this ad's photo"
                : needsImage
                  ? "This ad needs a different photo for X"
                  : "Adly changed your ad so X can approve it"}
          </h2>
          <p className="mt-1 text-small text-ink-muted">
            {notForX
              ? `X's reviewers read the ${noun} page this ad links to, and what it shows means X will reject the ad however its text is written${
                  pagePolitical ? " (X doesn't allow political ads aimed at Kenya)" : ""
                }.${review.landing ? " Adly suggests a version of the page below." : ""}`
              : photoBlocked
                ? "An update can't change the photo of an ad that is already running. Stop this ad and create a new one with a different photo."
                : needsImage
                ? "X would reject the photo, and none of this project's other photos can be used either."
                : "X would likely reject the ad as it is. Here is what Adly changed and why. Nothing is published until you approve and confirm."}
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {notForX && (
            <section>
              <h3 className="meta-label mb-2">What X would reject</h3>
              <ul className="space-y-2">
                {blocks.map((f, i) => (
                  <li key={i} className="rounded-md border border-error/30 bg-error-muted p-3 text-small">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
                      <Ban className="h-4 w-4 shrink-0 text-error" aria-hidden />
                      {FIELD_LABEL[f.field]}
                      <span className="font-normal text-ink-muted">“{f.found}”</span>
                    </p>
                    <p className="mt-1 text-ink-muted">{f.why}</p>
                    {f.rule === "opportunity" && (
                      <p className="mt-1 text-ink-muted">
                        <Link href={editHref} className="font-medium text-accent underline">
                          Edit the opportunity
                        </Link>
                        , then try again.
                      </p>
                    )}
                    {f.rule === "impersonation" && f.change && (
                      <p className="mt-1 text-ink-muted">
                        {f.change}:{" "}
                        <Link href="/dashboard/profile" className="font-medium text-accent underline">
                          edit your profile
                        </Link>
                        .
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {photoBlocked && (
            <section>
              <h3 className="meta-label mb-2">What X would reject</h3>
              <div className="rounded-md border border-error/30 bg-error-muted p-3 text-small">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <ImageOff className="h-4 w-4 shrink-0 text-error" aria-hidden />
                  The ad&apos;s photo
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink-muted">
                  {review.image.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                {review.image.previewDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL preview of the photo X sees
                  <img src={review.image.previewDataUrl} alt="" className="mt-3 aspect-[1.91/1] w-full max-w-sm rounded-sm object-cover" />
                )}
              </div>
            </section>
          )}

          {notForX && review.landing && (
            <section>
              <h3 className="meta-label mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
                Adly&apos;s version of the {noun} page
              </h3>
              <p className="mb-3 text-caption text-ink-muted">
                {review.landing.by === "ai"
                  ? `Adly rewrote it around the ${noun} itself, keeping its facts and leaving out what X would reject.`
                  : "Adly kept the parts that describe the work and left out what X would reject (politics, prizes, government promises, hype)."}{" "}
                Check it is accurate and add anything missing: saving changes the public {noun} page.
              </p>
              <div className="space-y-3">
                <label className="block">
                  <span className="meta-label">{isOpportunity ? "Title" : "Project name"}</span>
                  <span className="mt-1 block">
                    <AdminInput value={pageName} maxLength={120} onChange={(e) => setPageName(e.target.value)} />
                  </span>
                </label>
                <label className="block">
                  <span className="meta-label">Description</span>
                  <textarea
                    value={pageText}
                    onChange={(e) => setPageText(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-small text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                <details className="text-caption text-ink-subtle">
                  <summary className="cursor-pointer">What the page says now</summary>
                  <p className="mt-1 font-medium text-ink-muted">{review.landing.original.name}</p>
                  <p className="mt-1 whitespace-pre-line">{review.landing.original.description}</p>
                </details>
              </div>
              {applyError && (
                <p className="mt-3 rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error" role="alert">
                  {applyError}
                </p>
              )}
              {onApplyLanding ? (
                <Button
                  type="button"
                  className="mt-3"
                  fullWidth
                  disabled={applying || !pageName.trim() || !pageText.trim()}
                  onClick={() => void applyLanding()}
                >
                  <RefreshCw className={cn("h-4 w-4", applying && "animate-spin")} />
                  {applying ? "Saving and checking…" : `Save to the ${noun} page and check again`}
                </Button>
              ) : (
                <p className="mt-3 text-small text-ink-muted">
                  <Link href={editHref} className="font-medium text-accent underline">
                    Edit the {noun}
                  </Link>{" "}
                  with this text, then try again.
                </p>
              )}
            </section>
          )}

          {notForX && pagePolitical && !review.landing && !officeTitle && (
            <p className="text-small text-ink-muted">
              <Link href={editHref} className="font-medium text-accent underline">
                Edit the {noun}
              </Link>{" "}
              so its name and description describe the work itself (what is being built or done, where, and for whom), then try
              again.
            </p>
          )}

          {!notForX && fixes.length > 0 && (
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

          {!notForX && (changed.headline || changed.body || changed.keywords) && (
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

          {!notForX && !photoLocked && (
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
          )}

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
            {photoBlocked ? "Close" : "Edit it myself"}
          </Button>
          {needsImage || notForX || photoBlocked ? (
            canDropX ? (
              <Button type="button" fullWidth onClick={onDropX}>
                Run on Google only
              </Button>
            ) : (
              onSwitchToGoogle && (
                <Button type="button" fullWidth variant="secondary" onClick={onSwitchToGoogle}>
                  Run on Google instead
                </Button>
              )
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
                  changes: shown.filter(
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
