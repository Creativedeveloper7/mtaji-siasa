import { usesTracker } from "@/server";
import { chatWithAdly, readConversation, setRecommendation } from "@/server/tracker/adly/service";
import { adlyEditor, readBody, send, trackerOnly } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The adly-agent edge function runs OpenAI plus tools; a turn can take a while.
export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

/** Chat transcript, Adly recommendations and channel results for one campaign. */
export async function GET(_request: Request, context: Context) {
  if (!usesTracker()) return trackerOnly();
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  const { id } = await context.params;
  return send(await readConversation(id, editor.actor.userId));
}

/** One chat turn: { message }. */
export async function POST(request: Request, context: Context) {
  if (!usesTracker()) return trackerOnly();
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  const { id } = await context.params;
  return send(await chatWithAdly(id, await readBody(request), editor.actor.userId));
}

/** Recommendation status: { id, status: "dismissed" | "applied" }. */
export async function PATCH(request: Request, context: Context) {
  if (!usesTracker()) return trackerOnly();
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  const { id } = await context.params;
  return send(await setRecommendation(id, await readBody(request), editor.actor.userId));
}
