"use client";

import type { Poll } from "@/types";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

interface PollCardProps {
  poll: Poll;
}

export function PollCard({ poll }: PollCardProps) {
  const total = poll.options.reduce((sum, o) => sum + o.votes, 0) || 1;

  return (
    <Card className="h-full">
      <h3 className="text-h3 text-ink">{poll.question}</h3>
      <ul className="mt-6 space-y-3">
        {poll.options.map((option) => {
          const pct = Math.round((option.votes / total) * 100);
          return (
            <li key={option.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-small">
                <span className="text-ink-muted">{option.label}</span>
                <span className="font-mono text-caption text-ink-subtle">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-accent/80"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-caption text-ink-subtle">
        <span>{poll.participationCount.toLocaleString()} participants</span>
        <span>Closes {formatDate(poll.closingDate)}</span>
      </div>
    </Card>
  );
}
