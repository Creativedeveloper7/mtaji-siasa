import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { MAX_UPLOAD_BYTES, UploadError, storeImage } from "@/server/storage/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload one photo (multipart field "file") to Supabase Storage.
 * Returns { ok, url }. While storage is off it answers 501 and the browser
 * keeps the photo inline as before.
 *
 * Phase 2: uploads go to a Tracker bucket created by a Tracker migration.
 * Until then they stay off, so Siasa does not create buckets in the Tracker
 * project on its own.
 */
const STORAGE_ENABLED = false;
export async function POST(request: Request) {
  const gate = await requireRoles(["admin", "leader", "aspirant"]);
  if (gate.response || !gate.session) {
    return gate.response ?? NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  if (!STORAGE_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "Photo storage is not configured.", fallback: "inline" },
      { status: 501 }
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ ok: false, error: "Send the photo as multipart form data." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "No photo was sent." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image is too large. Please use a file under 5 MB." },
      { status: 413 }
    );
  }

  try {
    const url = await storeImage(gate.session.userId, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, url }, { status: 201 });
  } catch (error) {
    const status = error instanceof UploadError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
