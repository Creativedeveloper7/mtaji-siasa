import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userClient } from "@/server/tracker/clients";
import {
  IMAGE_BUCKET,
  ImageUploadError,
  imageObjectPath,
  objectPathFromPublicUrl,
  validateImage,
} from "./validation";

export { IMAGE_BUCKET, ImageUploadError, MAX_IMAGE_BYTES } from "./validation";

/**
 * Photo uploads into the Tracker's existing public `initiative-images` bucket,
 * with the signed-in user's session (storage policy: authenticated may insert
 * into the bucket). Siasa never creates buckets and never uses the service
 * role for uploads.
 */

export interface StoredImage {
  url: string;
  path: string;
  contentType: string;
  bytes: number;
}

/**
 * Validate and store one image; returns its public URL.
 * Objects go to `<auth uid>/<yyyy-mm>/<24 random hex>.<ext>` and are never
 * overwritten (upsert: false).
 */
export async function storeTrackerImage(
  bytes: Uint8Array,
  declaredType?: string | null,
  getClient: () => Promise<SupabaseClient> = userClient
): Promise<StoredImage> {
  const mime = validateImage(bytes, declaredType);
  const client = await getClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ImageUploadError(401, "Sign in required.");
  const path = imageObjectPath(data.user.id, mime, randomBytes(12).toString("hex"));
  const upload = await client.storage.from(IMAGE_BUCKET).upload(path, bytes, {
    contentType: mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upload.error) throw new ImageUploadError(502, `Storage upload failed: ${upload.error.message}`);
  const url = client.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, path, contentType: mime, bytes: bytes.byteLength };
}

/**
 * Delete an image the caller uploaded. Only objects under the caller's own
 * `<auth uid>/` folder are deleted: the bucket's DELETE policy lets any
 * signed-in user delete any object (§14, fixed by M9), so the folder check
 * lives here until then. Returns false for foreign or unknown URLs.
 */
export async function deleteTrackerImage(
  url: string,
  getClient: () => Promise<SupabaseClient> = userClient
): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!base) return false;
  const path = objectPathFromPublicUrl(url, base);
  if (!path) return false;
  const client = await getClient();
  const { data } = await client.auth.getUser();
  if (!data.user || path.split("/")[0] !== data.user.id.toLowerCase()) return false;
  const { data: removed, error } = await client.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) throw new ImageUploadError(502, `Storage delete failed: ${error.message}`);
  return (removed ?? []).length > 0;
}
