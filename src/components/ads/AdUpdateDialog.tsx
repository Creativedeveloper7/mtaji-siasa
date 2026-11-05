"use client";

import { useState } from "react";
import { AdminField, AdminInput } from "@/components/admin/AdminUI";
import { AdAudienceFields, audienceBody, audienceFromAd, type AdAudienceValue } from "@/components/ads/AdAudienceFields";
import { Button } from "@/components/ui/Button";
import { apiJson } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { AD_TEXT_LIMITS, minAdBudgetKes } from "@/lib/constants";
import { AdTextField } from "@/components/ads/AdTextField";
import { AdlyXReview } from "@/components/ads/AdlyXReview";
import { useContent } from "@/components/content/ContentProvider";
import { ShieldCheck, Sparkles } from "lucide-react";
import type { AdCampaign, AdPolicyFinding, AdPolicyReview } from "@/types";

function copyKey(headline: string, body: string, keywords: string[]): string {
  return JSON.stringify([headline.trim(), body.trim(), keywords]);
}

/**
 * Before "Update on networks" (or publishing a saved ad): the owner checks
 * and changes the ad text, where the ad runs, its age group and its budget.
 * When the ad runs on X, Adly reviews it against X's policies first, as the
 * composer does: what X would reject, why, and Adly's version to approve.
 * Saving stores the changes; `onSaved` then publishes. The photo stays as it
 * was approved.
 */
export function AdUpdateDialog({
  ad,
  onSaved,
  onClose,
  mode = "update",
}: {
  ad: AdCampaign;
  onSaved: (saved: AdCampaign) => void;
  onClose: () => void;
  /** "publish": the ad has not run yet */
  mode?: "update" | "publish";
}) {
  const [audience, setAudience] = useState<AdAudienceValue>(() => audienceFromAd(ad.locations, ad.ageGroup));
  const [budget, setBudget] = useState(() => Math.max(ad.budgetKes, minAdBudgetKes(ad.platforms.length)));
  const [headline, setHeadline] = useState(ad.headline);
  const [text, setText] = useState(ad.body);
  const [keywords, setKeywords] = useState(ad.keywords);
  const [review, setReview] = useState<AdPolicyReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  /** The copy Adly last passed or the owner approved, so it isn't reviewed twice */
  const [checkedKey, setCheckedKey] = useState("");
  const [adlyChanges, setAdlyChanges] = useState<AdPolicyFinding[]>([]);
  const [adlyNotes, setAdlyNotes] = useState<AdPolicyFinding[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const { content, upsertProject } = useContent();
  const increase = budget - ad.budgetKes;
  // An ad published below the minimum (e.g. KES 40) has to be raised before it can run.
  const minBudget = Math.max(ad.budgetKes, minAdBudgetKes(ad.platforms.length));
  const runsOnX = ad.platforms.some((p) => p.platform === "x");

  const save = async () => {
    if (budget < ad.budgetKes) {
      setError(`A running ad's budget can only go up (it is ${formatCurrency(ad.budgetKes)}).`);
      return;
    }
    if (budget < minBudget) {
      setError(`The minimum budget is ${formatCurrency(minBudget)}: below that the networks barely show the ad.`);
      return;
    }
    if (!headline.trim() || !text.trim()) {
      setError("Add a headline and the ad text.");
      return;
    }
    setError("");
    if (runsOnX && checkedKey !== copyKey(headline, text, keywords)) {
      setReviewing(true);
      const checked = await apiJson<{ review?: AdPolicyReview; error?: string }>("/api/ads/review", {
        method: "POST",
        body: JSON.stringify({ projectId: ad.projectId, headline: headline.trim(), body: text.trim(), keywords, imageUrl: ad.imageUrl }),
      });
      setReviewing(false);
      if (checked.ok && checked.data.review) {
        const r = checked.data.review;
        // Photo shape notes don't apply (the photo stays); a name that differs on the photo still does.
        setAdlyNotes(r.findings.filter((f) => f.severity === "advice" && (f.field !== "image" || f.found === "Name on the photo")));
        const same = copyKey(r.suggested.headline, r.suggested.body, r.suggested.keywords) === copyKey(headline, text, keywords);
        // The photo can't change in an update, so a photo X would reject is shown (and stops the update) too.
        if (r.status === "not_for_x" || !r.image.ok || !same) {
          setReview(r);
          return;
        }
        setCheckedKey(copyKey(headline, text, keywords));
      } else if (checked.status !== 400 && checked.status !== 403) {
        setError(checked.data.error || "Adly could not check the ad for X. Try again.");
        return;
      }
      // 400/403: not the signed-in account's own project (an admin); the server still checks it on save.
    }
    setSaving(true);
    const result = await apiJson<{ item?: AdCampaign; error?: string }>(`/api/ads/campaigns/${encodeURIComponent(ad.id)}`, {
      method: "POST",
      body: JSON.stringify({ action: "edit", ...audienceBody(audience), budgetKes: budget, headline, body: text, keywords }),
    });
    setSaving(false);
    if (!result.ok || !result.data.item) {
      setError(result.data.error || "Could not save the changes.");
      return;
    }
    onSaved(result.data.item);
  };

  if (review) {
    return (
      <AdlyXReview
        review={review}
        photoLocked
        canDropX={false}
        onEdit={() => setReview(null)}
        onDropX={() => setReview(null)}
        onApplyLanding={async (page) => {
          const project = content.projects.find((p) => p.id === ad.projectId);
          if (!project) return "Adly could not find this ad's project. Edit it from Projects.";
          const saved = await upsertProject({ ...project, name: page.name, description: page.description });
          if (!saved.ok) return saved.error || "Could not save the project.";
          // Back to the form: "Save and update" checks the ad again before anything is charged.
          setCheckedKey("");
          setPageNotice("Project page updated. Press “Save and update”: Adly checks the ad again before it goes out.");
          setReview(null);
          return null;
        }}
        onApprove={(version) => {
          setHeadline(version.headline);
          setText(version.body);
          setKeywords(version.keywords);
          setAdlyChanges(version.changes);
          setCheckedKey(copyKey(version.headline, version.body, version.keywords));
          setReview(null);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-bg/75 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-update-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col rounded-t-lg border border-border bg-bg-elevated shadow-raised sm:rounded-lg"
      >
        <div className="border-b border-border p-5">
          <h2 id="ad-update-title" className="text-h3 text-ink">
            {mode === "publish" ? "Publish this ad" : "Update this ad"}
          </h2>
          <p className="mt-1 text-small text-ink-muted">
            {mode === "publish"
              ? "Check the text, who sees the ad and its budget, then send it to the networks."
              : "Check the text, who sees the ad and its budget, then send the update to the networks. On X a changed ad goes out as a new post, which X reviews again."}{" "}
            {runsOnX ? "Adly checks it against X's ad policies first. " : ""}The photo stays as it is.
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <AdTextField label="Headline" value={headline} maxLength={AD_TEXT_LIMITS.headline} onChange={setHeadline} />
          <AdTextField label="Ad text" multiline value={text} maxLength={AD_TEXT_LIMITS.body} onChange={setText} />
          {adlyChanges.length > 0 && (
            <div className="rounded-md border border-accent/30 bg-accent-muted px-3 py-2 text-caption text-ink-muted">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
                Adly&apos;s version for X is in the fields above
              </p>
              <ul className="mt-1 list-disc pl-5">
                {adlyChanges.map((f, i) => (
                  <li key={i}>{f.change ?? f.why}</li>
                ))}
              </ul>
              {keywords.join("\n") !== ad.keywords.join("\n") && <p className="mt-1">Keywords: {keywords.join(", ")}</p>}
            </div>
          )}
          {adlyNotes.length > 0 && (
            <ul className="space-y-1.5 text-caption text-ink-muted">
              {adlyNotes.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  <span>{f.why}</span>
                </li>
              ))}
            </ul>
          )}
          <AdAudienceFields value={audience} onChange={setAudience} />
          <AdminField
            label="Total budget (KES)"
            hint={
              ad.budgetKes < minBudget
                ? `This budget is too small for the networks to show the ad. Raise it to at least ${formatCurrency(minBudget)}.`
                : increase > 0
                  ? `${formatCurrency(increase)} more is paid from your wallet when the networks accept the update.`
                  : "The budget can only go up while the ad is running."
            }
          >
            <AdminInput
              type="number"
              min={minBudget}
              step={100}
              value={budget}
              onChange={(e) => setBudget(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          </AdminField>
          {pageNotice && (
            <p className="rounded-md border border-success/30 bg-success-muted px-3 py-2 text-caption text-success" role="status">
              {pageNotice}
            </p>
          )}
          {error && (
            <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row">
          <Button type="button" variant="secondary" fullWidth onClick={onClose} disabled={saving || reviewing}>
            Cancel
          </Button>
          <Button type="button" fullWidth onClick={() => void save()} disabled={saving || reviewing}>
            {reviewing ? "Adly is checking…" : saving ? "Saving…" : mode === "publish" ? "Save and publish" : "Save and update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
