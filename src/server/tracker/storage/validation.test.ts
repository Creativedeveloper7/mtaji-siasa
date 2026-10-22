import { describe, expect, it } from "vitest";
import {
  ImageUploadError,
  MAX_IMAGE_BYTES,
  imageObjectPath,
  objectPathFromPublicUrl,
  sniffImageMime,
  validateImage,
} from "./validation";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
const UID = "11111111-1111-4111-8111-111111111111";

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ImageUploadError ? error.status : -1;
  }
  return undefined;
}

describe("sniffImageMime", () => {
  it("recognises the four allowed formats and nothing else", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(GIF)).toBe("image/gif");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
    expect(sniffImageMime(SVG)).toBeNull();
  });
});

describe("validateImage", () => {
  it("accepts a matching or missing declared type", () => {
    expect(validateImage(JPEG, "image/jpeg")).toBe("image/jpeg");
    expect(validateImage(JPEG, "image/jpg")).toBe("image/jpeg");
    expect(validateImage(PNG)).toBe("image/png");
    expect(validateImage(PNG, "application/octet-stream")).toBe("image/png");
  });
  it("rejects empty, oversized, unknown, disallowed and mismatched files", () => {
    expect(statusOf(() => validateImage(new Uint8Array()))).toBe(400);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(JPEG);
    expect(statusOf(() => validateImage(big))).toBe(413);
    expect(statusOf(() => validateImage(SVG, "image/svg+xml"))).toBe(415);
    expect(statusOf(() => validateImage(PNG, "text/html"))).toBe(415);
    expect(statusOf(() => validateImage(PNG, "image/jpeg"))).toBe(415);
  });
  it("accepts exactly the size limit", () => {
    const max = new Uint8Array(MAX_IMAGE_BYTES);
    max.set(JPEG);
    expect(validateImage(max)).toBe("image/jpeg");
  });
});

describe("imageObjectPath", () => {
  it("builds <uid>/<yyyy-mm>/<random>.<ext>", () => {
    expect(imageObjectPath(UID, "image/webp", "0123456789abcdef01234567", new Date("2026-10-22T00:00:00Z"))).toBe(
      `${UID}/2026-10/0123456789abcdef01234567.webp`
    );
  });
  it("refuses a non-uuid owner or a short/unsafe random name", () => {
    expect(statusOf(() => imageObjectPath("../etc", "image/png", "0123456789abcdef"))).toBe(401);
    expect(() => imageObjectPath(UID, "image/png", "short")).toThrow();
    expect(() => imageObjectPath(UID, "image/png", "../../0123456789abcdef")).toThrow();
  });
});

describe("objectPathFromPublicUrl", () => {
  const base = "https://jdddchjbglilkfrlenci.supabase.co";
  it("extracts the object path of the bucket", () => {
    expect(objectPathFromPublicUrl(`${base}/storage/v1/object/public/initiative-images/${UID}/2026-10/a.jpg?v=1`, `${base}/`)).toBe(
      `${UID}/2026-10/a.jpg`
    );
  });
  it("ignores other hosts, buckets and traversal", () => {
    expect(objectPathFromPublicUrl(`https://evil.example/storage/v1/object/public/initiative-images/a.jpg`, base)).toBeNull();
    expect(objectPathFromPublicUrl(`${base}/storage/v1/object/public/adly-creative-media/a.jpg`, base)).toBeNull();
    expect(objectPathFromPublicUrl(`${base}/storage/v1/object/public/initiative-images/${UID}/../x.jpg`, base)).toBeNull();
    expect(objectPathFromPublicUrl(`${base}/storage/v1/object/public/initiative-images/`, base)).toBeNull();
  });
});
