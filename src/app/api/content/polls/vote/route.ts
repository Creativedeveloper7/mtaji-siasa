import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { failureFromError } from "@/server/http-errors";
import { castPollVote, myPollVote, pollResults } from "@/server/tracker/content/polls/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trackerOnly() {
  return NextResponse.json(
    { ok: false, error: "Voting needs the M-Taji Tracker backend." },
    { status: 503 }
  );
}

function results(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map);
}

/**
 * GET ?pollId= : the signed-in user's vote on the poll (optionId, or null)
 * and the public tallies (option id -> votes).
 */
export async function GET(request: Request) {
  if (!usesTracker()) return trackerOnly();
  const pollId = new URL(request.url).searchParams.get("pollId")?.trim() ?? "";
  if (!pollId) return NextResponse.json({ ok: false, error: "pollId is required." }, { status: 400 });
  try {
    const [optionId, tallies] = await Promise.all([myPollVote(pollId), pollResults(pollId)]);
    return NextResponse.json({ ok: true, optionId: optionId ?? null, results: results(tallies) });
  } catch (error) {
    const failure = failureFromError(error, "read poll vote");
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}

/** POST { pollId, optionId }: one vote per signed-in user (cast_poll_vote RPC). */
export async function POST(request: Request) {
  if (!usesTracker()) return trackerOnly();
  let body: { pollId?: unknown; optionId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  const pollId = typeof body.pollId === "string" ? body.pollId.trim() : "";
  const optionId = typeof body.optionId === "string" ? body.optionId.trim() : "";
  if (!pollId || !optionId) {
    return NextResponse.json({ ok: false, error: "pollId and optionId are required." }, { status: 400 });
  }
  try {
    const result = await castPollVote(pollId, optionId);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    const tallies = await pollResults(pollId);
    return NextResponse.json(
      { ok: true, optionId, poll: result.poll ?? null, results: results(tallies) },
      { status: 201 }
    );
  } catch (error) {
    const failure = failureFromError(error, "cast poll vote");
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}
