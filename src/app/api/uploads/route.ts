import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { requireRoles } from "@/server/auth/http";
import { failureFromError } from "@/server/http-errors";
import { MAX_IMAGE_BYTES, storeTrackerImage } from "@/server/tracker/storage/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Room for the multipart framing around the file; the file itself is held to MAX_IMAGE_BYTES. */
const MULTIPART_OVERHEAD = 64 * 1024;

function tooLarge() {
  return NextResponse.json(
    { ok: false, error: "Image is too large. Please use a file under 5 MB." },
    { status: 413 }
  );
}

/**
 * Upload one photo (multipart field "file"). Returns { ok, url }.
 *
 * Tracker backend: stored in the Tracker's public `initiative-images` bucket
 * with the signed-in user's session (src/server/tracker/storage). Siasa never
 * creates buckets and never uses the service role here.
 * Memory store: answers 501 and the browser keeps the photo inline.
 */
export async function POST(request: Request) {
  const gate = await requireRoles(["admin", "leader", "aspirant"]);
  if (gate.response || !gate.session) {
    return gate.response ?? NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  if (!usesTracker()) {
    return NextResponse.json(
      { ok: false, error: "Photo storage is not configured.", fallback: "inline" },
      { status: 501 }
    );
  }

  // Refuse an oversized upload before reading any of the body.
  const declared = request.headers.get("content-length");
  if (declared === null) {
    return NextResponse.json({ ok: false, error: "Upload size is missing (Content-Length)." }, { status: 411 });
  }
  const length = Number(declared);
  if (!Number.isFinite(length) || length < 0) {
    return NextResponse.json({ ok: false, error: "Invalid Content-Length." }, { status: 400 });
  }
  if (length > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD) return tooLarge();

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ ok: false, error: "Send the photo as multipart form data." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "No photo was sent." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) return tooLarge();

  try {
    const stored = await storeTrackerImage(new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ ok: true, url: stored.url }, { status: 201 });
  } catch (error) {
    const failure = failureFromError(error, "upload image");
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}
