import { describe, expect, it } from "vitest";
import {
  entryAfterLoad,
  entryAfterVote,
  entryVoting,
  LOAD_FAILED,
  loadStillCurrent,
  settleAnswer,
  VOTE_FAILED,
  versionKey,
  type ApiAnswer,
  type VoteAnswer,
} from "@/components/polls/poll-votes";

const ALICE = "alice";
const BOB = "bob";

describe("settleAnswer", () => {
  it("passes an answer through", async () => {
    const answer = { ok: true, status: 200, data: { optionId: "a" } };
    expect(await settleAnswer<VoteAnswer>(Promise.resolve(answer), LOAD_FAILED)).toBe(answer);
  });

  it("turns a rejected request into a failed answer with status 0", async () => {
    expect(await settleAnswer<VoteAnswer>(Promise.reject(new TypeError("Failed to fetch")), VOTE_FAILED)).toEqual({
      ok: false,
      status: 0,
      data: { error: VOTE_FAILED },
    });
  });
});

describe("a load that fails outright (network)", () => {
  it("marks the poll loaded with an error, so voting is not stuck off", async () => {
    const result = await settleAnswer<VoteAnswer>(Promise.reject(new Error("offline")), LOAD_FAILED);
    expect(entryAfterLoad(undefined, ALICE, result)).toEqual({ owner: ALICE, loaded: true, error: LOAD_FAILED });
  });

  it("an HTTP failure still allows voting without an error", () => {
    const result: ApiAnswer<VoteAnswer> = { ok: false, status: 500, data: {} };
    expect(entryAfterLoad(undefined, ALICE, result)).toEqual({ owner: ALICE, loaded: true });
  });

  it("a successful load records the vote and tallies", () => {
    const result: ApiAnswer<VoteAnswer> = { ok: true, status: 200, data: { optionId: "a", results: { a: 3 } } };
    expect(entryAfterLoad({ owner: BOB, loaded: true, myOptionId: "b" }, ALICE, result)).toEqual({
      owner: ALICE,
      loaded: true,
      myOptionId: "a",
      results: { a: 3 },
    });
  });
});

describe("a vote that fails outright (network)", () => {
  it("clears busy and shows the error", async () => {
    const voting = entryVoting({ owner: ALICE, loaded: true }, ALICE);
    expect(voting.busy).toBe(true);
    const result = await settleAnswer<VoteAnswer>(Promise.reject(new Error("offline")), VOTE_FAILED);
    expect(entryAfterVote(voting, ALICE, "a", result)).toEqual({
      owner: ALICE,
      loaded: true,
      busy: false,
      error: VOTE_FAILED,
    });
  });
});

describe("sign-in/out while a vote is in flight", () => {
  it("keys versions by account, so the old account's vote does not drop the new account's load", () => {
    const versions: Record<string, number> = {};
    // Alice votes (version bumped for alice only).
    versions[versionKey(ALICE, "p1")] = 1;
    // Bob signs in; his load starts at his own version.
    const bobKey = versionKey(BOB, "p1");
    const startedAt = versions[bobKey] ?? 0;
    // Alice's vote settles.
    versions[versionKey(ALICE, "p1")] = 2;
    expect(loadStillCurrent(versions, bobKey, startedAt)).toBe(true);
    // A vote by the same account still makes an older load stale.
    versions[bobKey] = 1;
    expect(loadStillCurrent(versions, bobKey, startedAt)).toBe(false);
  });

  it("the old account's vote answer does not overwrite the new account's loaded entry", () => {
    const bobLoaded = { owner: BOB, loaded: true, myOptionId: null };
    const ok: ApiAnswer<VoteAnswer> = { ok: true, status: 200, data: { results: { a: 1 } } };
    expect(entryAfterVote(bobLoaded, ALICE, "a", ok)).toBe(bobLoaded);
  });
});
