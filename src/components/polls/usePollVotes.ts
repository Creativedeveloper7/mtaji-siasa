"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PollVoteState } from "@/components/cards/PollCard";
import { apiJson } from "@/lib/api-client";
import type { Poll } from "@/types";
import {
  entryAfterLoad,
  entryAfterVote,
  entryVoting,
  LOAD_FAILED,
  loadStillCurrent,
  settleAnswer,
  VOTE_FAILED,
  versionKey,
  type PollVoteEntry,
  type VoteAnswer,
} from "@/components/polls/poll-votes";

/**
 * Voting on the listed polls through /api/content/polls/vote: loads the
 * signed-in user's votes and the live tallies, and casts a vote.
 *
 * Each poll loads independently (in parallel) and is merged into state as its
 * answer arrives. A load answer is dropped for a poll that changed locally (a
 * vote started or finished) after that load began, so a slow load cannot undo
 * a vote just cast. Versions are kept per account and poll, so a vote by the
 * previous account (sign-in/out mid-vote) never drops the new account's load.
 * Each poll exposes `loaded`; the card keeps vote buttons off until it is
 * true. A request that fails outright (network) still settles: the load
 * shows an error and allows voting, and a vote is never left busy.
 */
export function usePollVotes(polls: Poll[]) {
  const { user, ready } = useAuth();
  const owner = user?.userId ?? "";
  const [entries, setEntries] = useState<Record<string, PollVoteEntry>>({});
  const [available, setAvailable] = useState(true);
  const ids = useMemo(() => polls.map((poll) => poll.id).join(","), [polls]);
  /** Bumped per `${owner}:${pollId}` whenever a vote starts or settles. */
  const localVersion = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!ready || !ids) return;
    let cancel = false;
    for (const pollId of ids.split(",")) {
      const key = versionKey(owner, pollId);
      const startedAt = localVersion.current[key] ?? 0;
      void settleAnswer(
        apiJson<VoteAnswer>(`/api/content/polls/vote?pollId=${encodeURIComponent(pollId)}`),
        LOAD_FAILED
      ).then((result) => {
        if (cancel) return;
        if (result.status === 503) {
          setAvailable(false);
          return;
        }
        // A vote on this poll by this account started or finished since the load began: keep it.
        if (!loadStillCurrent(localVersion.current, key, startedAt)) return;
        setEntries((current) => ({ ...current, [pollId]: entryAfterLoad(current[pollId], owner, result) }));
      });
    }
    return () => {
      cancel = true;
    };
  }, [ids, ready, owner]);

  const vote = useCallback(
    async (pollId: string, optionId: string) => {
      const key = versionKey(owner, pollId);
      const bump = () => {
        localVersion.current[key] = (localVersion.current[key] ?? 0) + 1;
      };
      bump();
      setEntries((current) => ({ ...current, [pollId]: entryVoting(current[pollId], owner) }));
      const result = await settleAnswer(
        apiJson<VoteAnswer>("/api/content/polls/vote", {
          method: "POST",
          body: JSON.stringify({ pollId, optionId }),
        }),
        VOTE_FAILED
      );
      bump();
      setEntries((current) => ({ ...current, [pollId]: entryAfterVote(current[pollId], owner, optionId, result) }));
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
