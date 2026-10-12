import { randomBytes } from "node:crypto";

/** Public bucket that holds every uploaded photo. Created on first upload. */
export const MEDIA_BUCKET = "media";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

type ImageType = keyof typeof TYPES;

const globalStorage = globalThis as typeof globalThis & { __mtajiBucketReady?: boolean };

function endpoint() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

/** Identify the image from its first bytes; the browser-supplied type is not trusted. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (...sig: number[]) => sig.every((value, i) => bytes[i] === value);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function ensureBucket(): Promise<void> {
  if (globalStorage.__mtajiBucketReady) return;
  const { url, headers } = endpoint();
  const existing = await fetch(`${url}/storage/v1/bucket/${MEDIA_BUCKET}`, { headers });
  if (!existing.ok) {
    const created = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: MEDIA_BUCKET,
        name: MEDIA_BUCKET,
        public: true,
        file_size_limit: MAX_UPLOAD_BYTES,
        allowed_mime_types: Object.keys(TYPES),
      }),
    });
    // Another request may have created it in the meantime.
    if (!created.ok && created.status !== 409) {
      const text = await created.text();
      if (!/already exists/i.test(text)) {
        throw new Error(`Could not create the "${MEDIA_BUCKET}" storage bucket: ${text}`);
      }
    }
  }
  globalStorage.__mtajiBucketReady = true;
}

export function publicUrl(path: string): string {
  const { url } = endpoint();
  return `${url}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/** Store one image and return its public URL. Paths are uploads/<user>/<yyyy-mm>/<random>.<ext>. */
export async function storeImage(userId: string, bytes: Uint8Array): Promise<string> {
  const type = sniffImageType(bytes);
  if (!type) throw new UploadError(400, "Only JPG, PNG, WebP or GIF images can be uploaded.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(413, "Image is too large. Please use a file under 5 MB.");
  }
  await ensureBucket();
  const { url, headers } = endpoint();
  const month = new Date().toISOString().slice(0, 7);
  const owner = userId.replace(/[^a-zA-Z0-9_-]/g, "") || "user";
  const path = `uploads/${owner}/${month}/${randomBytes(12).toString("hex")}.${TYPES[type]}`;
  const response = await fetch(`${url}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": type,
      "Cache-Control": "31536000",
      "x-upsert": "false",
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) {
    // A bucket deleted after we cached it as ready: retry once after re-creating.
    if (response.status === 404 && globalStorage.__mtajiBucketReady) {
      globalStorage.__mtajiBucketReady = false;
      return storeImage(userId, bytes);
    }
    throw new UploadError(502, `Storage upload failed: ${await response.text()}`);
  }
  return publicUrl(path);
}

export class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
