import { usesTracker } from "@/server";
import { readWorkspace } from "@/server/adly/service";
import { readTrackerWorkspace } from "@/server/tracker/adly/service";
import { adlyEditor, send } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adly workspace: { content, stats }. Campaigns come from the Tracker when it is configured. */
export async function GET() {
  const editor = await adlyEditor();
  if (editor.response) return editor.response;
  if (!usesTracker()) return send(await readWorkspace(editor.actor));
  return send(await readTrackerWorkspace(editor.actor));
}
