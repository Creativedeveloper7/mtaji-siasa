import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { actorFromSession, type ContentActor } from "@/server/content/service";
import { readWorkspace } from "@/server/adly/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const editor = await editorActor();
  if (editor.response) return editor.response;
  const result = readWorkspace(editor.actor);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}

async function editorActor(): Promise<
  { actor: ContentActor; response?: undefined } | { response: NextResponse }
> {
  const gate = await requireRoles(["admin", "leader", "aspirant"]);
  if (gate.response || !gate.session) {
    return {
      response:
        gate.response ??
        NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 }),
    };
  }
  const actor = actorFromSession(gate.session);
  if ("ok" in actor) {
    return {
      response: NextResponse.json({ ok: false, error: actor.error }, { status: actor.status }),
    };
  }
  return { actor };
}
