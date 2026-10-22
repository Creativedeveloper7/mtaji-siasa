"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PollVoteState } from "@/components/cards/PollCard";
import { apiJson } from "@/lib/api-client";
import type { Poll } from "@/types";

interface Entry {
  /** The account this entry was loaded or voted for ("" when signed out). */
  owner: string;
  /** The poll's own load has answered for this owner. */
  loaded?: boolean;
  myOptionId?: string | null;
  results?: Record<string, number>;
  busy?: boolean;
  error?: string;
}

type VoteAnswer = { optionId?: string | null; results?: Record<string, number>; error?: string };

/**
 * Voting on the listed polls through /api/content/polls/vote: loads the
 * signed-in user's votes and the live tallies, and casts a vote.
 *
 * Each poll loads independently (in parallel) and is merged into state as its
 * answer arrives. A load answer is dropped for a poll that changed locally (a
 * vote started or finished) after that load began, so a slow load cannot undo
 * a vote just cast. Each poll exposes `loaded`; the card keeps vote buttons
 * off until it is true.
 */
export function usePollVotes(polls: Poll[]) {
  const { user, ready } = useAuth();
  const owner = user?.userId ?? "";
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [available, setAvailable] = useState(true);
  const ids = useMemo(() => polls.map((poll) => poll.id).join(","), [polls]);
  /** Bumped per poll whenever a vote starts or settles. */
  const localVersion = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!ready || !ids) return;
    let cancel = false;
    for (const pollId of ids.split(",")) {
      const startedAt = localVersion.current[pollId] ?? 0;
      void apiJson<VoteAnswer>(`/api/content/polls/vote?pollId=${encodeURIComponent(pollId)}`).then((result) => {
        if (cancel) return;
        if (result.status === 503) {
          setAvailable(false);
          return;
        }
        // A vote on this poll started or finished since the load began: keep it.
        if ((localVersion.current[pollId] ?? 0) !== startedAt) return;
        setEntries((current) => {
          const previous = current[pollId]?.owner === owner ? current[pollId] : undefined;
          return {
            ...current,
            [pollId]: result.ok
              ? { owner, loaded: true, myOptionId: result.data.optionId ?? null, results: result.data.results }
              : // Could not read this poll's state: allow voting; the server still refuses a second vote.
                { ...previous, owner, loaded: true },
          };
        });
      });
    }
    return () => {
      cancel = true;
    };
  }, [ids, ready, owner]);

  const vote = useCallback(
    async (pollId: string, optionId: string) => {
      const bump = () => {
        localVersion.current[pollId] = (localVersion.current[pollId] ?? 0) + 1;
      };
      bump();
      setEntries((current) => ({
        ...current,
        [pollId]: { ...current[pollId], owner, loaded: true, busy: true, error: undefined },
      }));
      const result = await apiJson<VoteAnswer>("/api/content/polls/vote", {
        method: "POST",
        body: JSON.stringify({ pollId, optionId }),
      });
      bump();
      setEntries((current) => ({
        ...current,
        [pollId]: result.ok
          ? { owner, loaded: true, myOptionId: optionId, results: result.data.results }
          : { ...current[pollId], owner, loaded: true, busy: false, error: result.data.error || "Could not record your vote." },
      }));
    },
    [owner]
  );

  return useCallback(
    (poll: Poll): PollVoteState => {
      if (!available) return { hint: "Voting opens when the site runs on the M-Taji Tracker backend." };
      const stored = entries[poll.id];
      // An entry loaded for another account (before sign-in/out) does not count.
      const entry = stored?.owner === owner ? stored : undefined;
      return {
        myOptionId: entry?.myOptionId,
        results: entry?.results,
        busy: entry?.busy,
        error: entry?.error,
        loaded: Boolean(entry?.loaded),
        onVote: user ? (optionId: string) => void vote(poll.id, optionId) : undefined,
        hint: user ? undefined : "Sign in to vote.",
      };
    },
    [entries, available, owner, user, vote]
  );
}
