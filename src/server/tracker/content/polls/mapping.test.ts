import { describe, expect, it } from "vitest";
import type { Poll } from "@/types";
import {
  isPollOpen,
  mapPollRow,
  planOptionChanges,
  pollWrite,
  tallyResults,
  voteErrorFor,
  type PollOptionRow,
  type PollRow,
} from "./mapping";

const POLL = "248b0fb5-426a-40c1-84b1-f454ae1e07b8";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Shaped like the live poll: open, no end date, authenticated eligibility. */
function liveRow(overrides: Partial<PollRow> = {}): PollRow {
  return {
    id: POLL,
    owner_id: "11111111-1111-4111-8111-111111111111",
    title: "Which project first?",
    description: null,
    status: "open",
    eligibility: "authenticated",
    ends_at: null,
    created_at: "2026-07-21T10:00:00Z",
    updated_at: "2026-07-21T10:00:00Z",
    ...overrides,
  };
}

const options: PollOptionRow[] = [
  { id: B, poll_id: POLL, label: "Water", sort_order: 1 },
  { id: A, poll_id: POLL, label: "Roads", sort_order: 0 },
  { id: C, poll_id: "other-poll", label: "Elsewhere", sort_order: 0 },
];

describe("tallyResults", () => {
  it("reads bigint counts sent as numbers or strings", () => {
    const tally = tallyResults([
      { option_id: A, votes: "3" },
      { option_id: B, votes: 0 },
      { option_id: C, votes: "bad" },
    ]);
    expect(tally.get(A)).toBe(3);
    expect(tally.get(B)).toBe(0);
    expect(tally.get(C)).toBe(0);
    expect(tallyResults(null).size).toBe(0);
  });
});

describe("mapPollRow", () => {
  it("maps the live poll with no end date", () => {
    const poll = mapPollRow(liveRow(), options, {
      slug: "which-project-first",
      leaderId: "fig",
      results: new Map([[A, 1]]),
    });
    expect(poll).toEqual({
      id: POLL,
      slug: "which-project-first",
      question: "Which project first?",
      options: [
        { id: A, label: "Roads", votes: 1 },
        { id: B, label: "Water", votes: 0 },
      ],
      closingDate: "",
      leaderId: "fig",
      participationCount: 1,
    });
  });
  it("shows the closing day in Nairobi", () => {
    const poll = mapPollRow(liveRow({ ends_at: "2026-11-30T20:59:59Z" }), [], { slug: "s", results: new Map() });
    expect(poll.closingDate).toBe("2026-11-30");
    expect(poll.options).toEqual([]);
    expect(poll.participationCount).toBe(0);
  });
});

describe("isPollOpen", () => {
  const now = new Date("2026-10-22T08:00:00Z");
  it("treats an open poll without an end date as open", () => {
    expect(isPollOpen(liveRow(), now)).toBe(true);
  });
  it("closes on status or a past end date", () => {
    expect(isPollOpen(liveRow({ status: "closed" }), now)).toBe(false);
    expect(isPollOpen(liveRow({ status: "draft" }), now)).toBe(false);
    expect(isPollOpen(liveRow({ ends_at: "2026-10-01T00:00:00Z" }), now)).toBe(false);
    expect(isPollOpen(liveRow({ ends_at: "2026-12-01T00:00:00Z" }), now)).toBe(true);
  });
});

describe("pollWrite", () => {
  const base: Poll = {
    id: "pol-1",
    slug: "s",
    question: "  Which first? ",
    options: [],
    closingDate: "2026-11-30",
    participationCount: 0,
  };
  const now = new Date("2026-10-22T08:00:00Z");
  it("writes title and an end-of-day ends_at", () => {
    expect(pollWrite(base, null, now)).toEqual({
      title: "Which first?",
      ends_at: "2026-11-30T20:59:59.000Z",
      updated_at: now.toISOString(),
    });
  });
  it("writes a null ends_at for no closing date", () => {
    expect(pollWrite({ ...base, closingDate: "" }, null, now).ends_at).toBeNull();
  });
  it("keeps the stored ends_at when the Nairobi date is unchanged", () => {
    // 18:00 EAT on 30 Nov, set in the Tracker.
    const existing = { ends_at: "2026-11-30T15:00:00+00:00" };
    expect(pollWrite(base, existing, now).ends_at).toBe("2026-11-30T15:00:00+00:00");
    // A different date moves it to the end of the new day.
    expect(pollWrite({ ...base, closingDate: "2026-12-01" }, existing, now).ends_at).toBe("2026-12-01T20:59:59.000Z");
    // Clearing the date clears ends_at.
    expect(pollWrite({ ...base, closingDate: "" }, existing, now).ends_at).toBeNull();
    // 22:30 UTC on 30 Nov is already 1 Dec in Nairobi: same EAT date "2026-12-01" keeps it.
    const late = { ends_at: "2026-11-30T22:30:00Z" };
    expect(pollWrite({ ...base, closingDate: "2026-12-01" }, late, now).ends_at).toBe("2026-11-30T22:30:00Z");
    expect(pollWrite(base, late, now).ends_at).toBe("2026-11-30T20:59:59.000Z");
  });
  it("never writes owner_id, status or votes", () => {
    const write = pollWrite(base, null, now);
    expect(write).not.toHaveProperty("owner_id");
    expect(write).not.toHaveProperty("status");
  });
});

describe("planOptionChanges", () => {
  const current: PollOptionRow[] = [
    { id: A, poll_id: POLL, label: "Roads", sort_order: 0 },
    { id: B, poll_id: POLL, label: "Water", sort_order: 1 },
  ];

  it("creates every option for a new poll, with sort_order = index", () => {
    expect(planOptionChanges([], [{ id: "opt-1", label: "Yes" }, { id: "opt-2", label: " No " }], new Map())).toEqual({
      updates: [],
      inserts: [
        { label: "Yes", sort_order: 0 },
        { label: "No", sort_order: 1 },
      ],
      deletes: [],
      blocked: [],
    });
  });
  it("does nothing when nothing changed", () => {
    const plan = planOptionChanges(current, [{ id: A, label: "Roads" }, { id: B, label: "Water" }], new Map());
    expect(plan).toEqual({ updates: [], inserts: [], deletes: [], blocked: [] });
  });
  it("relabels and reorders voted options, keeping their ids (and votes)", () => {
    const plan = planOptionChanges(current, [{ id: B, label: "Clean water" }, { id: A, label: "Roads" }], new Map([[A, 4]]));
    expect(plan.updates).toEqual([
      { id: B, label: "Clean water", sort_order: 0 },
      { id: A, label: "Roads", sort_order: 1 },
    ]);
    expect(plan.deletes).toEqual([]);
  });
  it("deletes a removed option without votes", () => {
    const plan = planOptionChanges(current, [{ id: A, label: "Roads" }], new Map([[A, 2]]));
    expect(plan.deletes).toEqual([B]);
    expect(plan.blocked).toEqual([]);
  });
  it("blocks removing an option that has votes", () => {
    const plan = planOptionChanges(current, [{ id: A, label: "Roads" }, { id: "opt-new", label: "Health" }], new Map([[B, 3]]));
    expect(plan.blocked).toEqual([{ id: B, label: "Water", votes: 3 }]);
    expect(plan.inserts).toEqual([{ label: "Health", sort_order: 1 }]);
  });
  it("skips blank labels and treats a repeated id as a new option", () => {
    const plan = planOptionChanges(current, [{ id: A, label: "Roads" }, { id: A, label: "Roads again" }, { id: B, label: "  " }], new Map());
    expect(plan.inserts).toEqual([{ label: "Roads again", sort_order: 1 }]);
    expect(plan.deletes).toEqual([B]);
  });
});

describe("voteErrorFor", () => {
  it("maps RPC and constraint errors", () => {
    // Exact messages / SQLSTATEs raised by cast_poll_vote (20261022200000_siasa_polls.sql).
    expect(voteErrorFor({ code: "28000", message: "not_authenticated" })).toEqual({ status: 401, message: "Sign in to vote." });
    expect(voteErrorFor({ code: "P0001", message: "poll_not_open" })).toEqual({ status: 409, message: "This poll is closed." });
    expect(voteErrorFor({ code: "P0001", message: "invalid_option" })).toEqual({
      status: 400,
      message: "That option is not part of this poll.",
    });
    expect(voteErrorFor({ code: "23505", message: "already_voted" })).toEqual({
      status: 409,
      message: "You have already voted in this poll.",
    });
    // Code alone is enough for the two with dedicated SQLSTATEs.
    expect(voteErrorFor({ code: "28000" }).status).toBe(401);
    expect(voteErrorFor({ code: "23505", message: "duplicate key value violates unique constraint" }).status).toBe(409);
    // A P0001 with some other message is not guessed at.
    expect(voteErrorFor({ code: "P0001", message: "poll closed" }).status).toBe(500);
    expect(voteErrorFor({ message: "boom" }).status).toBe(500);
  });
});
