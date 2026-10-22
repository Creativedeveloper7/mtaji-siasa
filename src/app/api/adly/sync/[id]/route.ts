import { usesTracker } from "@/server";
import { syncCampaignInsights } from "@/server/tracker/adly/service";
import { adlyEditor, send, trackerOnly } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Pull live impressions / clicks / spend for one campaign (sync-ad-insights). */
export async function POST(_request: Request, context: Context) {
  if (!usesTracker()) return trackerOnly();
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  const { id } = await context.params;
  return send(await syncCampaignInsights(editor.session, id));
}
