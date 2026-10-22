"use client";

import { Check } from "lucide-react";
import type { Poll } from "@/types";
import { cn, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

/** Voting state for one poll, owned by the page that lists the polls. */
export interface PollVoteState {
  /** The option the signed-in user chose, if they voted. */
  myOptionId?: string | null;
  /** Live tallies (option id -> votes). Falls back to the options' own counts. */
  results?: Record<string, number>;
  busy?: boolean;
  error?: string;
  /**
   * This poll's vote state has loaded. Vote buttons stay off until then, so a
   * user who already voted is not offered a second vote. Absent counts as loaded.
   */
  loaded?: boolean;
  /** Absent when voting is not possible here (signed out, memory store). */
  onVote?: (optionId: string) => void;
  /** Shown instead of vote buttons when onVote is absent. */
  hint?: string;
}

/** A poll without a closing date stays open; one whose date has passed is closed. */
export function isPollClosed(poll: Poll, now = new Date()): boolean {
  if (!poll.closingDate) return false;
  const end = new Date(`${poll.closingDate.slice(0, 10)}T23:59:59+03:00`).getTime();
  return !Number.isNaN(end) && end < now.getTime();
}

interface PollCardProps {
  poll: Poll;
  vote?: PollVoteState;
}

export function PollCard({ poll, vote }: PollCardProps) {
  const votesFor = (id: string, fallback: number) => vote?.results?.[id] ?? fallback;
  const counts = poll.options.map((o) => votesFor(o.id, o.votes));
  const sum = counts.reduce((a, b) => a + b, 0);
  const total = sum || 1;
  const closed = isPollClosed(poll);
  const voted = Boolean(vote?.myOptionId);
  const loading = Boolean(vote?.onVote) && vote?.loaded === false;
  // Buttons stay mounted while a vote is recorded (disabled + aria-busy) so focus is not lost.
  const showButtons = Boolean(vote?.onVote) && !voted && !closed && !loading;
  const busy = Boolean(vote?.busy);
  const canVote = showButtons && !busy;
  const participants = vote?.results ? sum : poll.participationCount;

  return (
    <Card className="h-full">
      <h3 className="text-h3 text-ink">{poll.question}</h3>
      <ul className="mt-6 space-y-3">
        {poll.options.map((option, index) => {
          const pct = Math.round((counts[index] / total) * 100);
          const mine = vote?.myOptionId === option.id;
          const row = (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-small">
                <span className={cn("inline-flex items-center gap-1.5", mine ? "font-medium text-ink" : "text-ink-muted")}>
                  {mine && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
                  {option.label}
                  {mine && <span className="sr-only">(your vote)</span>}
                </span>
                <span className="font-mono text-caption text-ink-subtle">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className={cn("h-full rounded-full", mine ? "bg-accent" : "bg-accent/80")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          );
          return (
            <li key={option.id}>
              {showButtons ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  onClick={() => {
                    if (canVote) vote?.onVote?.(option.id);
                  }}
                  className="block w-full rounded-md p-1 -m-1 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-70 disabled:hover:bg-transparent"
                  aria-label={`Vote for ${option.label}`}
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {/* Always mounted so screen readers announce changes (recording, counted, errors). */}
      <p
        role="status"
        className={cn(
          "text-caption empty:hidden",
          vote?.error ? "text-error" : "text-ink-subtle",
          vote && "mt-4"
        )}
      >
        {vote?.error ||
          (voted
            ? "Thanks, your vote is counted."
            : closed
              ? ""
              : busy
                ? "Recording your vote…"
                : loading
                  ? "Checking your vote…"
                  : canVote
                    ? "Tap an option to vote. One vote per account."
                    : vote?.hint)}
      </p>
      <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-caption text-ink-subtle">
        <span>{participants.toLocaleString()} participants</span>
        <span>{closed ? `Closed ${formatDate(poll.closingDate)}` : poll.closingDate ? `Closes ${formatDate(poll.closingDate, "soon")}` : "Open"}</span>
      </div>
    </Card>
  );
}
