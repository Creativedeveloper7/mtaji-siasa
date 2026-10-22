import { describe, expect, it, vi } from "vitest";
import type { Poll } from "@/types";

vi.mock("@/server/tracker/clients", () => ({
  anonClient: () => {
    throw new Error("not used");
  },
  userClient: async () => {
    throw new Error("not used");
  },
  serviceClient: () => {
    throw new Error("not used");
  },
}));

const { castPollVote, createPollRepository } = await import("./repository");
const { fakeContentClients } = await import("@/server/tracker/content/opportunities/fake.test-helpers");
const { ownerUserIdOf } = await import("@/server/tracker/content/media/shared");
type FakeState = import("@/server/tracker/content/opportunities/fake.test-helpers").FakeState;

const OWNER = "11111111-1111-4111-8111-111111111111";
const VOTER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const POLL = "248b0fb5-426a-40c1-84b1-f454ae1e07b8";
const OTHER_POLL = "348b0fb5-426a-40c1-84b1-f454ae1e07b8";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const X = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FIG = "44444444-4444-4444-8444-444444444444";
const FIG_LATER = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

/** Mirrors public.cast_poll_vote in 20261022200000_siasa_polls.sql, error for error. */
function castPollVoteRpc(args: Record<string, unknown>, state: FakeState) {
  const uid = state.userId;
  if (!uid) return { data: null, error: { code: "28000", message: "not_authenticated" } };
  const poll = state.tables.polls.find((row) => row.id === args.p_poll_id);
  const open =
    poll &&
    poll.status === "open" &&
    (!poll.ends_at || Date.parse(String(poll.ends_at)) > Date.now()) &&
    poll.eligibility === "authenticated";
  if (!open) return { data: null, error: { code: "P0001", message: "poll_not_open" } };
  const option = state.tables.poll_options.find((row) => row.id === args.p_option_id && row.poll_id === args.p_poll_id);
  if (!option) return { data: null, error: { code: "P0001", message: "invalid_option" } };
  if (state.tables.poll_votes.some((row) => row.poll_id === args.p_poll_id && row.voter_user_id === uid)) {
    return { data: null, error: { code: "23505", message: "already_voted" } };
  }
  const id = `dddddddd-0000-4000-8000-${String(state.tables.poll_votes.length + 1).padStart(12, "0")}`;
  state.tables.poll_votes.push({ id, poll_id: args.p_poll_id, option_id: args.p_option_id, voter_user_id: uid });
  return { data: id, error: null };
}

/** Mirrors public.poll_results: per option of an open/closed poll, with zeros. */
function pollResultsRpc(args: Record<string, unknown>, state: FakeState) {
  const poll = state.tables.polls.find((row) => row.id === args.p_poll_id);
  if (!poll || !["open", "closed"].includes(String(poll.status))) return { data: [], error: null };
  const data = state.tables.poll_options
    .filter((option) => option.poll_id === poll.id)
    .map((option) => ({
      option_id: option.id,
      votes: String(state.tables.poll_votes.filter((vote) => vote.option_id === option.id).length),
    }));
  return { data, error: null };
}

function pollRow(overrides: Row = {}): Row {
  return {
    id: POLL,
    owner_id: OWNER,
    title: "Which road first?",
    description: null,
    status: "open",
    eligibility: "authenticated",
    ends_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function db(userId: string | null = OWNER, extra: Partial<FakeState> = {}): FakeState {
  return {
    userId: userId ?? undefined,
    calls: [],
    rpc: { cast_poll_vote: castPollVoteRpc, poll_results: pollResultsRpc },
    tables: {
      polls: [pollRow(), pollRow({ id: OTHER_POLL, title: "Other", owner_id: STRANGER })],
      poll_options: [
        { id: A, poll_id: POLL, label: "Roads", sort_order: 0 },
        { id: B, poll_id: POLL, label: "Water", sort_order: 1 },
        { id: X, poll_id: OTHER_POLL, label: "Elsewhere", sort_order: 0 },
      ],
      poll_votes: [{ id: "eeeeeeee-0000-4000-8000-000000000001", poll_id: POLL, option_id: A, voter_user_id: STRANGER }],
      political_figures: [
        // The owner's first figure, then one added later: the first stays their leaderId.
        { id: FIG, user_id: OWNER, name: "Hon. Owner", created_at: "2025-01-01T00:00:00Z" },
        { id: FIG_LATER, user_id: OWNER, name: "Later row", created_at: "2026-06-01T00:00:00Z" },
      ],
    },
    ...extra,
  };
}

describe("castPollVote (cast_poll_vote RPC errors end to end)", () => {
  it("records a vote and returns fresh tallies", async () => {
    const state = db(VOTER);
    const result = await castPollVote(POLL, B, fakeContentClients(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.poll?.options.map((option) => [option.label, option.votes])).toEqual([
      ["Roads", 1],
      ["Water", 1],
    ]);
    expect(result.poll?.participationCount).toBe(2);
  });

  it("answers 409 already voted on a second vote", async () => {
    const state = db(VOTER);
    await castPollVote(POLL, B, fakeContentClients(state));
    expect(await castPollVote(POLL, A, fakeContentClients(state))).toEqual({
      ok: false,
      status: 409,
      error: "You have already voted in this poll.",
    });
    expect(state.tables.poll_votes.filter((vote) => vote.voter_user_id === VOTER)).toHaveLength(1);
  });

  it("answers 409 closed for a closed or expired poll", async () => {
    const closed = db(VOTER);
    closed.tables.polls[0].status = "closed";
    expect(await castPollVote(POLL, A, fakeContentClients(closed))).toEqual({
      ok: false,
      status: 409,
      error: "This poll is closed.",
    });
    const expired = db(VOTER);
    expired.tables.polls[0].ends_at = "2020-01-01T00:00:00Z";
    expect((await castPollVote(POLL, A, fakeContentClients(expired))).ok).toBe(false);
    expect(await castPollVote(POLL, A, fakeContentClients(expired))).toMatchObject({ status: 409 });
  });

  it("answers 400 for another poll's option", async () => {
    expect(await castPollVote(POLL, X, fakeContentClients(db(VOTER)))).toEqual({
      ok: false,
      status: 400,
      error: "That option is not part of this poll.",
    });
  });

  it("answers 401 when signed out, and when the RPC says not_authenticated", async () => {
    expect(await castPollVote(POLL, A, fakeContentClients(db(null)))).toMatchObject({ ok: false, status: 401 });
    const state = db(VOTER);
    state.rpc!.cast_poll_vote = () => ({ data: null, error: { code: "28000", message: "not_authenticated" } });
    expect(await castPollVote(POLL, A, fakeContentClients(state))).toEqual({
      ok: false,
      status: 401,
      error: "Sign in to vote.",
    });
  });

  it("answers 503 while the RPC is not deployed", async () => {
    const state = db(VOTER);
    delete state.rpc!.cast_poll_vote;
    expect(await castPollVote(POLL, A, fakeContentClients(state))).toMatchObject({ ok: false, status: 503 });
  });
});

describe("poll repository", () => {
  it("exposes the owner's user id and the oldest figure as leaderId", async () => {
    const poll = await createPollRepository(fakeContentClients(db())).findPoll(POLL);
    expect(ownerUserIdOf(poll)).toBe(OWNER);
    expect(poll?.leaderId).toBe(FIG);
  });

  it("refuses with 409 to remove an option that has votes, and changes nothing", async () => {
    const state = db();
    const repo = createPollRepository(fakeContentClients(state));
    const poll = (await repo.findPoll(POLL)) as Poll;
    await expect(
      repo.upsertPoll({ ...poll, options: poll.options.filter((option) => option.id !== A) })
    ).rejects.toMatchObject({ status: 409 });
    expect(state.tables.poll_options.filter((option) => option.poll_id === POLL).map((o) => o.id)).toEqual([A, B]);
    expect(state.tables.poll_votes).toHaveLength(1);
    expect(state.calls.some((call) => call.op === "delete")).toBe(false);
  });

  it("removes a zero-vote option, but refuses if a vote arrives just before the delete", async () => {
    const quiet = db();
    const repo = createPollRepository(fakeContentClients(quiet));
    const poll = (await repo.findPoll(POLL)) as Poll;
    const saved = await repo.upsertPoll({ ...poll, options: poll.options.filter((option) => option.id !== B) });
    expect(saved.options.map((option) => option.id)).toEqual([A]);

    const racing = db();
    racing.beforeQuery = (call) => {
      // The pre-delete re-check of option B: a vote lands right before it.
      if (call.table === "poll_votes" && call.filters.some(([, column, value]) => column === "option_id" && value === B)) {
        if (!racing.tables.poll_votes.some((vote) => vote.option_id === B)) {
          racing.tables.poll_votes.push({ id: "v-new", poll_id: POLL, option_id: B, voter_user_id: VOTER });
        }
      }
    };
    const racingRepo = createPollRepository(fakeContentClients(racing));
    await expect(
      racingRepo.upsertPoll({ ...poll, options: poll.options.filter((option) => option.id !== B) })
    ).rejects.toMatchObject({ status: 409 });
    expect(racing.tables.poll_options.some((option) => option.id === B)).toBe(true);
    expect(racing.tables.poll_votes.some((vote) => vote.option_id === B)).toBe(true);
  });

  it("keeps the stored ends_at when the closing date is unchanged", async () => {
    const state = db();
    state.tables.polls[0].ends_at = "2099-11-30T15:00:00+00:00"; // 18:00 in Nairobi
    const repo = createPollRepository(fakeContentClients(state));
    const poll = (await repo.findPoll(POLL)) as Poll;
    expect(poll.closingDate).toBe("2099-11-30");
    await repo.upsertPoll({ ...poll, question: "Which road should be first?" });
    expect(state.tables.polls[0]).toMatchObject({
      title: "Which road should be first?",
      ends_at: "2099-11-30T15:00:00+00:00",
    });
  });

  it("refuses a non-admin editing another user's poll (403)", async () => {
    const state = db(STRANGER);
    const repo = createPollRepository(fakeContentClients(state));
    const poll = (await repo.findPoll(POLL)) as Poll;
    await expect(repo.upsertPoll({ ...poll, question: "Hijacked" })).rejects.toMatchObject({ status: 403 });
    expect(state.tables.polls[0].title).toBe("Which road first?");
  });
});
