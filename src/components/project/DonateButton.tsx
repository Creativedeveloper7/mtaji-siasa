"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { DonationDialog, DonationReturn } from "@/components/engagement/Donation";
import { cn } from "@/lib/utils";

/**
 * "Donate now" on a project page (the primary gold, green on hover): opens the donate
 * form; the donation goes to the project owner's wallet. Also thanks the
 * donor when Paystack sends them back to this page.
 */
export function DonateButton({ projectId, projectName, className }: { projectId: string; projectName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-small font-bold text-ink-inverse shadow-glow transition-colors hover:bg-brand-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/50",
          className
        )}
      >
        <Heart className="h-4 w-4" aria-hidden />
        Donate now
      </button>
      <DonationDialog open={open} onClose={() => setOpen(false)} target={{ kind: "project", id: projectId }} recipientName={projectName} />
      <DonationReturn recipientName={projectName} />
    </>
  );
}
