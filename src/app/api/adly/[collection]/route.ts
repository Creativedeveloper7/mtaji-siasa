import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { actorFromSession, type ContentActor, type ContentResult } from "@/server/content/service";
import {
  ADLY_COLLECTIONS,
  deleteAdly,
  listAdly,
  saveAdly,
  type AdlyCollection,
} from "@/server/adly/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ collection: string }> };

export async function GET(request: Request, context: Context) {
  const collection = await readCollection(context);
  if (!collection) return unknownCollection();
  const editor = await editorActor();
  if (editor.response) return editor.response;
  return send(listAdly(editor.actor, collection, new URL(request.url).searchParams));
}

export async function PUT(request: Request, context: Context) {
  const collection = await readCollection(context);
  if (!collection) return unknownCollection();
  const editor = await editorActor();
  if (editor.response) return editor.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(saveAdly(editor.actor, collection, body));
}

export async function DELETE(request: Request, context: Context) {
  const collection = await readCollection(context);
  if (!collection) return unknownCollection();
  const editor = await editorActor();
  if (editor.response) return editor.response;
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  return send(deleteAdly(editor.actor, collection, id));
}

async function readCollection(context: Context): Promise<AdlyCollection | null> {
  const { collection } = await context.params;
  return ADLY_COLLECTIONS.includes(collection as AdlyCollection)
    ? (collection as AdlyCollection)
    : null;
}

function unknownCollection() {
  return NextResponse.json({ ok: false, error: "Unknown Adly collection." }, { status: 404 });
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
