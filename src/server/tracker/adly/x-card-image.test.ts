import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropForXCard, fitsXCard, X_CARD_SIZE } from "@/server/tracker/adly/x-card-image";
import { xCardImagePath } from "@/server/tracker/adly/repository";

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: "#2b6cb0" } }).jpeg().toBuffer();
  return new Uint8Array(buffer);
}

describe("fitsXCard", () => {
  it("accepts the shapes X lists, at their minimum sizes", () => {
    expect(fitsXCard(1200, 628)).toBe(true); // 1.91:1
    expect(fitsXCard(1920, 1080)).toBe(true); // 16:9
    expect(fitsXCard(1080, 1080)).toBe(true); // 1:1
    expect(fitsXCard(1080, 1350)).toBe(true); // 4:5
    expect(fitsXCard(1000, 1500)).toBe(true); // 2:3
    expect(fitsXCard(1080, 1920)).toBe(true); // 9:16
  });

  it("refuses other shapes and images below the minimum", () => {
    expect(fitsXCard(1280, 960)).toBe(false); // 4:3, the Faida photo X refused
    expect(fitsXCard(1000, 750)).toBe(false);
    expect(fitsXCard(500, 500)).toBe(false); // 1:1 but under 600x600
    expect(fitsXCard(0, 0)).toBe(false);
  });
});

describe("cropForXCard", () => {
  it("crops a 4:3 photo to 1200x628 JPEG", async () => {
    const out = await cropForXCard(await jpeg(1280, 960));
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([X_CARD_SIZE.width, X_CARD_SIZE.height, "jpeg"]);
  });

  it("leaves an image X already accepts alone", async () => {
    expect(await cropForXCard(await jpeg(1200, 628))).toBeNull();
    expect(await cropForXCard(await jpeg(800, 800))).toBeNull();
  });
});

type Upload = { path: string; bytes: Uint8Array; options: unknown };

function fakeStorage(files: Record<string, Uint8Array>, uploadError?: { message: string }) {
  const uploads: Upload[] = [];
  const bucket = {
    download: async (path: string) =>
      files[path] ? { data: new Blob([Buffer.from(files[path])]), error: null } : { data: null, error: { message: "Object not found" } },
    upload: async (path: string, bytes: Uint8Array, options: unknown) => {
      uploads.push({ path, bytes, options });
      return { error: uploadError ?? null };
    },
  };
  const client = { storage: { from: () => bucket } } as unknown as Parameters<typeof xCardImagePath>[0];
  return { client, uploads };
}

describe("xCardImagePath", () => {
  it("returns the original path when the shape already fits", async () => {
    const { client, uploads } = fakeStorage({ "u/c/a.jpg": await jpeg(1200, 628) });
    expect(await xCardImagePath(client, "u/c/a.jpg")).toBe("u/c/a.jpg");
    expect(uploads).toHaveLength(0);
  });

  it("stores a 1200x628 crop beside the original and returns its path", async () => {
    const { client, uploads } = fakeStorage({ "u/c/siasa-1.png": await jpeg(1280, 960) });
    expect(await xCardImagePath(client, "u/c/siasa-1.png")).toBe("u/c/siasa-1-x-card.jpg");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].options).toMatchObject({ contentType: "image/jpeg", upsert: false });
    const meta = await sharp(uploads[0].bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 628]);
  });

  it("reuses a crop an earlier publish already stored", async () => {
    const { client } = fakeStorage({ "u/c/a.jpg": await jpeg(1280, 960) }, { message: "The resource already exists" });
    expect(await xCardImagePath(client, "u/c/a.jpg")).toBe("u/c/a-x-card.jpg");
  });

  it("throws on other storage errors, so the caller keeps the original", async () => {
    const missing = fakeStorage({});
    await expect(xCardImagePath(missing.client, "u/c/none.jpg")).rejects.toThrow(/Could not read the ad image/);
    const denied = fakeStorage({ "u/c/a.jpg": await jpeg(1280, 960) }, { message: "new row violates row-level security policy" });
    await expect(xCardImagePath(denied.client, "u/c/a.jpg")).rejects.toThrow(/Could not store the cropped ad image/);
  });
});
