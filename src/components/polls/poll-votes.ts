/**
 * Pure state helpers for usePollVotes, kept apart from React so they can be
 * unit tested in plain Node.
 */

export interface PollVoteEntry {
  /** The account this entry was loaded or voted for ("" when signed out). */
  owner: string;
  /** The poll's own load has answered for this owner. */
  loaded?: boolean;
  myOptionId?: string | null;
  results?: Record<string, number>;
  busy?: boolean;
  error?: string;
}

export type VoteAnswer = { optionId?: string | null; results?: Record<string, number>; error?: string };

export interface ApiAnswer<T> {
  ok: boolean;
  status: number;
  data: T;
}

export const LOAD_FAILED = "Could not load this poll's results. You can still vote.";
export const VOTE_FAILED = "Could not record your vote.";

/** A request that rejected (network down, aborted) becomes a failed answer with status 0. */
export function settleAnswer<T extends { error?: string }>(
  request: Promise<ApiAnswer<T>>,
  error: string
): Promise<ApiAnswer<T>> {
  return request.catch(() => ({ ok: false, status: 0, data: { error } as T }));
}

/**
 * Key for the per-poll local version: per account and poll, so a vote by one
 * account (before a sign-in or sign-out) never makes the next account's load
 * look stale.
 */
export function versionKey(owner: string, pollId: string): string {
  return `${owner}:${pollId}`;
}

/** The load answer for `pollId` still applies: no vote on it started or settled since the load began. */
export function loadStillCurrent(
  versions: Record<string, number>,
  key: string,
  startedAt: number
): boolean {
  return (versions[key] ?? 0) === startedAt;
}

/** The entry after a load answer. */
export function entryAfterLoad(
  current: PollVoteEntry | undefined,
  owner: string,
  result: ApiAnswer<VoteAnswer>
): PollVoteEntry {
  if (result.ok) {
    return { owner, loaded: true, myOptionId: result.data.optionId ?? null, results: result.data.results };
  }
  const previous = current?.owner === owner ? current : undefined;
  // Could not read this poll's state: allow voting; the server still refuses a
  // second vote. A request that never reached the server says so.
  return {
    ...previous,
    owner,
    loaded: true,
    ...(result.status === 0 ? { error: result.data.error || LOAD_FAILED } : {}),
  };
}

/** The entry while a vote is being recorded. */
export function entryVoting(current: PollVoteEntry | undefined, owner: string): PollVoteEntry {
  const previous = current?.owner === owner ? current : undefined;
  return { ...previous, owner, loaded: true, busy: true, error: undefined };
}

/** The entry after a vote answer (or a failed request). The voter's entry is never left busy. */
export function entryAfterVote(
  current: PollVoteEntry | undefined,
  owner: string,
  optionId: string,
  result: ApiAnswer<VoteAnswer>
): PollVoteEntry {
  // The account changed while the vote was in flight and the new account's
  // load already answered: that entry stays.
  if (current && current.owner !== owner) return current;
  if (result.ok) return { owner, loaded: true, myOptionId: optionId, results: result.data.results };
  const previous = current?.owner === owner ? current : undefined;
  return { ...previous, owner, loaded: true, busy: false, error: result.data.error || VOTE_FAILED };
}
