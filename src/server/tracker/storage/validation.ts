/**
 * Upload checks for the Tracker `initiative-images` bucket (content-mapping.md
 * §14). Pure, so tests load it without a Supabase client.
 *
 * The bucket has no size or mime limit of its own (file_size_limit and
 * allowed_mime_types are null on 2026-10-22), so these checks are the only ones.
 */

export const IMAGE_BUCKET = "initiative-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type ImageMime = keyof typeof IMAGE_TYPES;

export class ImageUploadError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ImageUploadError";
  }
}

/** Identify the image from its first bytes. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
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

/**
 * Validate an upload server-side. The type comes from the file's bytes; a
 * browser-declared type, when given, must be an allowed image type and agree
 * with the bytes (image/jpg is accepted as image/jpeg).
 */
export function validateImage(bytes: Uint8Array, declaredType?: string | null): ImageMime {
  if (bytes.byteLength === 0) throw new ImageUploadError(400, "The photo is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageUploadError(413, "Image is too large. Please use a file under 5 MB.");
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) throw new ImageUploadError(415, "Only JPG, PNG, WebP or GIF images can be uploaded.");
  const declared = declaredType?.trim().toLowerCase().split(";")[0];
  if (declared && declared !== "application/octet-stream") {
    const normalised = declared === "image/jpg" ? "image/jpeg" : declared;
    if (!(normalised in IMAGE_TYPES)) {
      throw new ImageUploadError(415, "Only JPG, PNG, WebP or GIF images can be uploaded.");
    }
    if (normalised !== sniffed) {
      throw new ImageUploadError(415, "The file's content does not match its type.");
    }
  }
  return sniffed;
}

/** `<auth uid>/<yyyy-mm>/<random>.<ext>` (§14). The first folder is what the M9 delete policy checks. */
export function imageObjectPath(userId: string, mime: ImageMime, random: string, now = new Date()): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new ImageUploadError(401, "Sign in required.");
  if (!/^[a-z0-9]{16,}$/i.test(random)) throw new Error("Object names need at least 16 random characters.");
  return `${userId.toLowerCase()}/${now.toISOString().slice(0, 7)}/${random}.${IMAGE_TYPES[mime]}`;
}

/**
 * The object path inside `initiative-images` for one of its public URLs, or
 * null when the URL is not a public object URL of that bucket on `baseUrl`.
 */
export function objectPathFromPublicUrl(url: string, baseUrl: string): string | null {
  const prefix = `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${IMAGE_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0]);
  if (!path || path.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return path;
}
