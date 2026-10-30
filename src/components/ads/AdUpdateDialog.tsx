"use client";

import { useState } from "react";
import { AdminField, AdminInput } from "@/components/admin/AdminUI";
import { AdAudienceFields, audienceBody, audienceFromAd, type AdAudienceValue } from "@/components/ads/AdAudienceFields";
import { Button } from "@/components/ui/Button";
import { apiJson } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import type { AdCampaign } from "@/types";

/**
 * Before "Update on networks": the owner checks and changes where the ad runs,
 * its age group and its budget. Saving stores the changes; `onSaved` then
 * republishes. The post text and photo stay as they were approved.
 */
export function AdUpdateDialog({
  ad,
  onSaved,
  onClose,
}: {
  ad: AdCampaign;
  onSaved: (saved: AdCampaign) => void;
  onClose: () => void;
}) {
  const [audience, setAudience] = useState<AdAudienceValue>(() => audienceFromAd(ad.locations, ad.ageGroup));
  const [budget, setBudget] = useState(ad.budgetKes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const increase = budget - ad.budgetKes;

  const save = async () => {
    if (budget < ad.budgetKes) {
      setError(`A running ad's budget can only go up (it is ${formatCurrency(ad.budgetKes)}).`);
      return;
    }
    setSaving(true);
    setError("");
    const result = await apiJson<{ item?: AdCampaign; error?: string }>(`/api/ads/campaigns/${encodeURIComponent(ad.id)}`, {
      method: "POST",
      body: JSON.stringify({ action: "edit", ...audienceBody(audience), budgetKes: budget }),
    });
    setSaving(false);
    if (!result.ok || !result.data.item) {
      setError(result.data.error || "Could not save the changes.");
      return;
    }
    onSaved(result.data.item);
  };

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
            Update this ad
          </h2>
          <p className="mt-1 text-small text-ink-muted">
            Check who sees the ad and its budget, then send the update to the networks. The text and photo stay as they are.
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <AdAudienceFields value={audience} onChange={setAudience} />
          <AdminField
            label="Total budget (KES)"
            hint={
              increase > 0
                ? `${formatCurrency(increase)} more is paid from your wallet when the networks accept the update.`
                : "The budget can only go up while the ad is running."
            }
          >
            <AdminInput
              type="number"
              min={ad.budgetKes}
              step={100}
              value={budget}
              onChange={(e) => setBudget(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          </AdminField>
          {error && (
            <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row">
          <Button type="button" variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" fullWidth onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save and update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
