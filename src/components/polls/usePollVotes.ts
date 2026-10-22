"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PollVoteState } from "@/components/cards/PollCard";
import { apiJson } from "@/lib/api-client";
import type { Poll } from "@/types";

interface Entry {
  myOptionId?: string | null;
  results?: Record<string, number>;
  busy?: boolean;
  error?: string;
}

type VoteAnswer = { optionId?: string | null; results?: Record<string, number>; error?: string };

/**
 * Voting on the listed polls through /api/content/polls/vote: loads the
 * signed-in user's votes and the live tallies, and casts a vote.
 */
export function usePollVotes(polls: Poll[]) {
  const { user, ready } = useAuth();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [available, setAvailable] = useState(true);
  const ids = useMemo(() => polls.map((poll) => poll.id).join(","), [polls]);

  useEffect(() => {
    if (!ready || !ids) return;
    let cancel = false;
    (async () => {
      const next: Record<string, Entry> = {};
      for (const pollId of ids.split(",")) {
        const result = await apiJson<VoteAnswer>(`/api/content/polls/vote?pollId=${encodeURIComponent(pollId)}`);
        if (cancel) return;
        if (result.status === 503) {
          setAvailable(false);
          return;
        }
        if (result.ok) next[pollId] = { myOptionId: result.data.optionId ?? null, results: result.data.results };
      }
      if (!cancel) setEntries(next);
    })();
    return () => {
      cancel = true;
    };
  }, [ids, ready, user?.userId]);

  const vote = useCallback(async (pollId: string, optionId: string) => {
    setEntries((current) => ({ ...current, [pollId]: { ...current[pollId], busy: true, error: undefined } }));
    const result = await apiJson<VoteAnswer>("/api/content/polls/vote", {
      method: "POST",
      body: JSON.stringify({ pollId, optionId }),
    });
    setEntries((current) => ({
      ...current,
      [pollId]: result.ok
        ? { myOptionId: optionId, results: result.data.results }
        : { ...current[pollId], busy: false, error: result.data.error || "Could not record your vote." },
    }));
  }, []);

  return useCallback(
    (poll: Poll): PollVoteState => {
      const entry = entries[poll.id] ?? {};
      if (!available) return { hint: "Voting opens when the site runs on the M-Taji Tracker backend." };
      return {
        ...entry,
        onVote: user ? (optionId: string) => void vote(poll.id, optionId) : undefined,
        hint: user ? undefined : "Sign in to vote.",
      };
    },
    [entries, available, user, vote]
  );
}
