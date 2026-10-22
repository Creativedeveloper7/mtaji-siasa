import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { deleteAdly, saveAdly } from "@/server/adly/service";
import { isRecord } from "@/server/content/parse";
import { deleteTrackerCampaign, saveTrackerCreative, saveTrackerPlan } from "@/server/tracker/adly/service";
import { adlyEditor, readBody, send } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Save an Adly campaign plan.
 * PUT { campaign, creative?, policyReview? }  -> one adly_campaigns row (Tracker)
 * PUT { creative } with id "cr_<campaign id>"  -> that campaign's creative only
 */
export async function PUT(request: Request) {
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  const body = await readBody(request);
  if (!isRecord(body)) return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });

  if (!usesTracker()) return send(await saveMemoryPlan(editor.actor, body));
  if (!body.campaign && isRecord(body.creative)) return send(await saveTrackerCreative(editor.actor, body.creative));
  return send(await saveTrackerPlan(editor.actor, body));
}

/** DELETE ?id=<campaign id>. Drafts are deleted; published campaigns are archived. */
export async function DELETE(request: Request) {
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  if (!usesTracker()) return send(await deleteAdly(editor.actor, "campaigns", id));
  return send(await deleteTrackerCampaign(editor.actor, id));
}

/** Memory store: the same three saves the page used to make one by one. */
async function saveMemoryPlan(actor: Parameters<typeof saveAdly>[0], body: Record<string, unknown>) {
  if (isRecord(body.creative)) {
    const saved = await saveAdly(actor, "creatives", body.creative);
    if (!saved.ok || !body.campaign) return saved;
  }
  if (!isRecord(body.campaign)) return { ok: false as const, status: 400, error: "campaign is required." };
  const campaign = await saveAdly(actor, "campaigns", body.campaign);
  if (!campaign.ok || !isRecord(body.policyReview)) return campaign;
  const review = await saveAdly(actor, "policy-reviews", body.policyReview);
  return review.ok ? campaign : review;
}
