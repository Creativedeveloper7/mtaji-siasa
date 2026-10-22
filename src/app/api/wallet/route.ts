import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { requireRoles } from "@/server/auth/http";
import { actorFromSession, type ContentActor, type ContentResult } from "@/server/content/service";
import { readWallet } from "@/server/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (usesTracker()) return gone();
  const editor = await editorActor();
  if (editor.response) return editor.response;
  const leaderId = new URL(request.url).searchParams.get("leaderId")?.trim();
  return send(await readWallet(editor.actor, leaderId));
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

function send(result: ContentResult) {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

/** Superseded by /api/wallet/payments on the Tracker backend; kept for the memory store only. */
function gone() {
  return NextResponse.json({ ok: false, error: "Use /api/wallet/payments." }, { status: 410 });
}
