import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Poll } from "@/types";
import type { ContentRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { assignSlugs, findBySlug, isUuid, rowSlug } from "@/server/tracker/slug";
import {
  ContentWriteError,
  defaultContentClients,
  fail,
  figuresForUsers,
  optionalUserClient,
  readRowForWrite,
  requireCaller,
  resolveOwner,
  type ContentClients,
} from "@/server/tracker/content/media/session";
import { groupIdsByOwner, isMissingFunctionError, leaderIdForOwner, pickByIds } from "@/server/tracker/content/media/shared";
import {
  mapPollRow,
  planOptionChanges,
  pollWrite,
  tallyResults,
  voteErrorFor,
  type PollOptionRow,
  type PollResultRow,
  type PollRow,
} from "./mapping";

export type PollRepository = Pick<
  Promisified<ContentRepository>,
  "listPolls" | "findPoll" | "findPollBySlug" | "listPollsByIds" | "upsertPoll" | "deletePoll"
>;

/** Polls the public sees. RLS shows only 'open' until M7 adds 'closed'. */
const PUBLIC_STATUSES = ["open", "closed"];

/**
 * Poll on public.polls + poll_options (content-mapping.md §9).
 *
 * Reads: anon; tallies from the NEW poll_results RPC (zeros until M7 ships).
 * findPoll(id) also finds the caller's own draft through their session.
 * Writes: caller's session (polls_owner_all, poll_options_owner_write); an
 * admin editing another leader's poll uses the service client (resolveOwner).
 * Option edits never delete an option that has votes (409, see planOptionChanges).
 * Poll + option writes are separate requests, not one transaction: a failed
 * option write after a successful insert deletes the new poll again; a failed
 * option write on update leaves the earlier option steps applied.
 */
export function createPollRepository(clients: ContentClients = defaultContentClients): PollRepository {
  async function loadPublic(): Promise<Poll[]> {
    const anon = clients.anon();
    const { data, error } = await anon
      .from("polls")
      .select("*")
      .in("status", PUBLIC_STATUSES)
      .order("created_at", { ascending: false });
    if (error) fail("Could not load polls", error);
    const rows = (data ?? []) as PollRow[];
    return mapRows(anon, rows, rows);
  }

  async function findOwnDraft(id: string): Promise<Poll | undefined> {
    const client = await optionalUserClient(clients);
    if (!client) return undefined;
    const { data, error } = await client.from("polls").select("*").eq("id", id).maybeSingle();
    if (error || !data) return undefined;
    const row = data as PollRow;
    return (await mapRows(client, [row], [row]))[0];
  }

  async function findPoll(id: string): Promise<Poll | undefined> {
    if (!isUuid(id)) return undefined;
    return (await loadPublic()).find((poll) => poll.id === id) ?? findOwnDraft(id);
  }

  return {
    listPolls: loadPublic,
    findPoll,
    async findPollBySlug(slug) {
      const polls = await loadPublic();
      return findBySlug(polls, new Map(polls.map((poll) => [poll.id, poll.slug])), slug);
    },
    async listPollsByIds(ids) {
      return pickByIds(await loadPublic(), ids);
    },
    async upsertPoll(poll) {
      if (!poll.options.some((option) => option.label.trim())) {
        throw new ContentWriteError(400, "A poll needs at least one option.");
      }
      const caller = await requireCaller(clients);
      const existing = await readRowForWrite<PollRow>(caller, clients, "polls", poll.id);
      const target = await resolveOwner(caller, clients, existing ? { ownerId: existing.owner_id } : null, poll.leaderId);
      const client = target.client;
      const write = pollWrite(poll);

      if (!existing) {
        const inserted = await client
          .from("polls")
          .insert({ ...write, owner_id: target.ownerId, status: "open" })
          .select("*")
          .single();
        if (inserted.error) fail("Could not create the poll", inserted.error);
        const row = inserted.data as PollRow;
        try {
          await applyOptions(client, row.id, [], poll);
        } catch (error) {
          await client.from("polls").delete().eq("id", row.id);
          throw error;
        }
        return reload(client, row.id);
      }

      const current = await loadOptions(client, existing.id);
      const votes = await voteCounts(client, existing.id);
      await applyOptions(client, existing.id, current, poll, votes);
      const updated = await client.from("polls").update(write).eq("id", existing.id).select("id").single();
      if (updated.error) fail("Could not save the poll", updated.error);
      return reload(client, existing.id);
    },
    async deletePoll(id) {
      const caller = await requireCaller(clients);
      const existing = await readRowForWrite<PollRow>(caller, clients, "polls", id);
      if (!existing) return false;
      const target = await resolveOwner(caller, clients, { ownerId: existing.owner_id }, undefined);
      // Options and votes go with it (ON DELETE CASCADE), like deleting it in the Tracker.
      const { data, error } = await target.client.from("polls").delete().eq("id", id).select("id");
      if (error) fail("Could not delete the poll", error);
      return (data ?? []).length > 0;
    },
  };

  async function reload(writer: SupabaseClient, id: string): Promise<Poll> {
    const { data, error } = await writer.from("polls").select("*").eq("id", id).single();
    if (error) fail("Could not load the poll", error);
    const row = data as PollRow;
    const pub = (await loadPublic()).find((poll) => poll.id === id);
    return pub ?? (await mapRows(writer, [row], [row]))[0];
  }
}

async function loadOptions(client: SupabaseClient, pollId: string): Promise<PollOptionRow[]> {
  const { data, error } = await client
    .from("poll_options")
    .select("id, poll_id, label, sort_order")
    .eq("poll_id", pollId)
    .order("sort_order");
  if (error) fail("Could not load poll options", error);
  return (data ?? []) as PollOptionRow[];
}

/** Owner read of votes per option (poll_votes_read lets the poll owner see them). */
async function voteCounts(client: SupabaseClient, pollId: string): Promise<Map<string, number>> {
  const { data, error } = await client.from("poll_votes").select("option_id").eq("poll_id", pollId);
  if (error) fail("Could not count poll votes", error);
  const out = new Map<string, number>();
  for (const row of (data ?? []) as { option_id: string }[]) {
    out.set(row.option_id, (out.get(row.option_id) ?? 0) + 1);
  }
  return out;
}

async function applyOptions(
  client: SupabaseClient,
  pollId: string,
  current: PollOptionRow[],
  poll: Poll,
  votes: Map<string, number> = new Map()
): Promise<void> {
  const plan = planOptionChanges(current, poll.options, votes);
  if (plan.blocked.length) {
    const names = plan.blocked.map((option) => `"${option.label}" (${option.votes} votes)`).join(", ");
    throw new ContentWriteError(
      409,
      `Options with votes cannot be removed: ${names}. Keep them, or close this poll and start a new one.`
    );
  }
  if (plan.deletes.length) {
    const { error } = await client.from("poll_options").delete().in("id", plan.deletes);
    if (error) fail("Could not remove poll options", error);
  }
  for (const update of plan.updates) {
    const { error } = await client
      .from("poll_options")
      .update({ label: update.label, sort_order: update.sort_order })
      .eq("id", update.id)
      .eq("poll_id", pollId);
    if (error) fail("Could not save a poll option", error);
  }
  if (plan.inserts.length) {
    const { error } = await client
      .from("poll_options")
      .insert(plan.inserts.map((option) => ({ ...option, poll_id: pollId })));
    if (error) fail("Could not add poll options", error);
  }
}

async function mapRows(client: SupabaseClient, rows: PollRow[], slugScope: PollRow[]): Promise<Poll[]> {
  if (!rows.length) return [];
  const slugs = assignSlugs(slugScope, (row) => row.title);
  const ids = rows.map((row) => row.id);
  const [optionsResult, figures, results] = await Promise.all([
    client.from("poll_options").select("id, poll_id, label, sort_order").in("poll_id", ids).order("sort_order"),
    figuresForUsers(client, rows.map((row) => row.owner_id)),
    Promise.all(ids.map((id) => fetchResults(client, id))),
  ]);
  if (optionsResult.error) fail("Could not load poll options", optionsResult.error);
  const options = (optionsResult.data ?? []) as PollOptionRow[];
  return rows.map((row, index) =>
    mapPollRow(row, options, {
      slug: slugs.get(row.id) ?? rowSlug(row.title, row.id),
      leaderId: leaderIdForOwner(row.owner_id, figures),
      results: results[index],
    })
  );
}

/**
 * The one call site of the NEW poll_results RPC (M7). Until M7 is applied the
 * function is missing and every option shows 0 votes.
 */
async function fetchResults(client: SupabaseClient, pollId: string): Promise<Map<string, number>> {
  const { data, error } = await client.rpc("poll_results", { p_poll_id: pollId });
  if (error) {
    if (isMissingFunctionError(error)) return new Map();
    fail("Could not load poll results", error);
  }
  return tallyResults(data as PollResultRow[] | null);
}

/** Public tallies for one poll: option id -> votes (anon, poll_results RPC). */
export async function pollResults(
  pollId: string,
  clients: ContentClients = defaultContentClients
): Promise<Map<string, number>> {
  if (!isUuid(pollId)) return new Map();
  return fetchResults(clients.anon(), pollId);
}

export type CastVoteResult =
  | { ok: true; voteId: string; poll: Poll | undefined }
  | { ok: false; status: number; error: string };

/**
 * Vote with the signed-in user's session through the NEW cast_poll_vote RPC
 * (M7). The RPC checks the poll is open and not past ends_at, that the option
 * belongs to the poll, and records voter_user_id = auth.uid(); the unique
 * (poll_id, voter_user_id) index allows one vote per user. There is no
 * fallback to a direct poll_votes insert: that path skips the open/option
 * checks (§9 RLS gap). Until M7 is applied this answers 503.
 * Returns the poll with fresh tallies.
 */
export async function castPollVote(
  pollId: string,
  optionId: string,
  clients: ContentClients = defaultContentClients
): Promise<CastVoteResult> {
  if (!isUuid(pollId) || !isUuid(optionId)) return { ok: false, status: 404, error: "Poll or option not found." };
  let caller;
  try {
    caller = await requireCaller(clients);
  } catch (error) {
    if (error instanceof ContentWriteError) return { ok: false, status: error.status, error: "Sign in to vote." };
    throw error;
  }
  const { data, error } = await caller.client.rpc("cast_poll_vote", { p_poll_id: pollId, p_option_id: optionId });
  if (error) {
    if (isMissingFunctionError(error)) {
      return { ok: false, status: 503, error: "Voting is not available yet." };
    }
    const failure = voteErrorFor(error);
    return { ok: false, status: failure.status, error: failure.message };
  }
  const poll = await createPollRepository(clients).findPoll(pollId);
  return { ok: true, voteId: String(data), poll };
}

/** The option the signed-in user voted for, if any (poll_votes_read: voter sees own vote). */
export async function myPollVote(
  pollId: string,
  clients: ContentClients = defaultContentClients
): Promise<string | undefined> {
  if (!isUuid(pollId)) return undefined;
  const client = await optionalUserClient(clients);
  if (!client) return undefined;
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return undefined;
  const { data, error } = await client
    .from("poll_votes")
    .select("option_id")
    .eq("poll_id", pollId)
    .eq("voter_user_id", auth.user.id)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { option_id: string }).option_id;
}

/**
 * Links helper for the leaders slice: auth user id -> ids of the polls they
 * own that the public can see (Leader.pollIds = polls.owner_id = uid, §3).
 * Pass political_figures.user_id values. Uses anon: 'open' only until M7.
 */
export async function pollIdsByOwner(
  ownerIds: string[],
  client: SupabaseClient = defaultContentClients.anon()
): Promise<Map<string, string[]>> {
  const ids = [...new Set(ownerIds.filter(isUuid))];
  if (!ids.length) return new Map();
  const { data, error } = await client
    .from("polls")
    .select("id, owner_id")
    .in("status", PUBLIC_STATUSES)
    .in("owner_id", ids)
    .order("created_at", { ascending: false });
  if (error) fail("Could not load poll links", error);
  return groupIdsByOwner((data ?? []) as { id: string; owner_id: string }[], (row) => row.owner_id);
}
