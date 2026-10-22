import type { Poll, PollOption } from "@/types";
import { eatDate, eatTimestamp } from "@/server/tracker/content/media/shared";

/**
 * Poll <-> public.polls + poll_options + poll_votes (content-mapping.md §9). Pure.
 *
 * Tallies come from the NEW `poll_results(p_poll_id)` RPC (M7); anon cannot
 * read poll_votes. Votes go through the NEW `cast_poll_vote` RPC (M7).
 */

export interface PollRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: string; // draft | open | closed
  eligibility: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  /** NEW (M1), generated */
  slug?: string | null;
}

export interface PollOptionRow {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
}

/** One row of poll_results(): bigint arrives as a number or a string. */
export interface PollResultRow {
  option_id: string;
  votes: number | string;
}

export function tallyResults(rows: PollResultRow[] | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows ?? []) {
    const votes = Number(row.votes);
    out.set(row.option_id, Number.isFinite(votes) && votes > 0 ? Math.floor(votes) : 0);
  }
  return out;
}

/**
 * Closed when status is 'closed' or ends_at has passed. Nothing in the Tracker
 * closes polls automatically, so the date alone also counts. Drafts are not open.
 */
export function isPollOpen(row: Pick<PollRow, "status" | "ends_at">, now = new Date()): boolean {
  if (row.status !== "open") return false;
  if (!row.ends_at) return true;
  const ends = Date.parse(row.ends_at);
  return Number.isNaN(ends) || ends > now.getTime();
}

export interface PollRelations {
  slug: string;
  leaderId?: string;
  /** option id -> votes; missing options count 0 */
  results: Map<string, number>;
}

export function mapPollRow(row: PollRow, options: PollOptionRow[], rel: PollRelations): Poll {
  const mapped: PollOption[] = options
    .filter((option) => option.poll_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((option) => ({ id: option.id, label: option.label, votes: rel.results.get(option.id) ?? 0 }));
  return {
    id: row.id,
    slug: rel.slug,
    question: row.title,
    options: mapped,
    // "" when ends_at is null (the live poll): the UI must show "Open", not formatDate("").
    closingDate: eatDate(row.ends_at),
    leaderId: rel.leaderId,
    participationCount: mapped.reduce((sum, option) => sum + option.votes, 0),
  };
}

/**
 * polls columns Siasa writes. owner_id and status = 'open' are added on insert only.
 *
 * Siasa only knows the closing DATE (closingDate = ends_at's date in Nairobi).
 * When an edit leaves that date unchanged, the stored ends_at is kept as is,
 * so a poll the Tracker set to close at e.g. 18:00 does not move to 23:59:59.
 */
export function pollWrite(
  poll: Poll,
  existing: Pick<PollRow, "ends_at"> | null = null,
  now = new Date()
): Record<string, unknown> {
  const stored = existing?.ends_at ?? null;
  const keepEnds = Boolean(stored) && (poll.closingDate ?? "").trim() === eatDate(stored);
  return {
    title: poll.question.trim(),
    // A date-only closingDate closes at the end of that day in Nairobi.
    ends_at: keepEnds ? stored : eatTimestamp(poll.closingDate, "23:59:59"),
    updated_at: now.toISOString(),
  };
}

export interface OptionPlan {
  /** existing options whose label or order changes */
  updates: { id: string; label: string; sort_order: number }[];
  /** new options (Siasa ids that are not existing option ids are dropped; the database makes uuids) */
  inserts: { label: string; sort_order: number }[];
  /** existing options removed by the edit that have no votes */
  deletes: string[];
  /** existing options removed by the edit that have votes; the edit is refused */
  blocked: { id: string; label: string; votes: number }[];
}

/**
 * Diff a Siasa option list against the stored options.
 *
 * Votes reference poll_options.id with ON DELETE CASCADE, so deleting an option
 * silently deletes its votes. The plan therefore never deletes an option that
 * has votes: such an edit is `blocked` and the repository refuses it with 409.
 * Relabelling a voted option is allowed (typo fixes) and keeps its votes;
 * re-ordering is free. An option matches by id only; an unknown id (e.g. a
 * Siasa "opt-..." id from the editor) is a new option.
 */
export function planOptionChanges(
  existing: PollOptionRow[],
  wanted: Pick<PollOption, "id" | "label">[],
  votes: Map<string, number>
): OptionPlan {
  const byId = new Map(existing.map((option) => [option.id, option]));
  const kept = new Set<string>();
  const plan: OptionPlan = { updates: [], inserts: [], deletes: [], blocked: [] };
  wanted.forEach((option, index) => {
    const label = option.label.trim();
    if (!label) return;
    const current = byId.get(option.id);
    if (current && !kept.has(current.id)) {
      kept.add(current.id);
      if (current.label !== label || current.sort_order !== index) {
        plan.updates.push({ id: current.id, label, sort_order: index });
      }
    } else {
      plan.inserts.push({ label, sort_order: index });
    }
  });
  for (const option of existing) {
    if (kept.has(option.id)) continue;
    const count = votes.get(option.id) ?? 0;
    if (count > 0) plan.blocked.push({ id: option.id, label: option.label, votes: count });
    else plan.deletes.push(option.id);
  }
  return plan;
}

export interface VoteFailure {
  status: number;
  message: string;
}

/**
 * cast_poll_vote errors -> HTTP status and a message for people. The RPC
 * (Tracker migration 20261022200000_siasa_polls.sql) raises exactly:
 *   not_authenticated / SQLSTATE 28000 -> 401
 *   poll_not_open     / P0001          -> 409 (closed, draft, past ends_at, or unknown poll)
 *   invalid_option    / P0001          -> 400
 *   already_voted     / 23505          -> 409
 * A raw 23505 (unique (poll_id, voter_user_id)) also means a second vote.
 */
export function voteErrorFor(error: { code?: string; message?: string }): VoteFailure {
  const message = (error.message ?? "").trim();
  if (message === "already_voted" || error.code === "23505") {
    return { status: 409, message: "You have already voted in this poll." };
  }
  if (message === "not_authenticated" || error.code === "28000") {
    return { status: 401, message: "Sign in to vote." };
  }
  if (message === "poll_not_open") return { status: 409, message: "This poll is closed." };
  if (message === "invalid_option") return { status: 400, message: "That option is not part of this poll." };
  return { status: 500, message: "Could not record your vote. Please try again." };
}
