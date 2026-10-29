import "server-only";
import sharp from "sharp";

/**
 * X image website cards only take certain shapes (X's own error lists them):
 * width:height of 191:100, 16:9, 1:1, 4:5, 2:3 or 9:16, at the minimum sizes
 * below. A 4:3 photo (1280x960) was refused, so the card failed and the ad
 * went out without one.
 */
const X_CARD_SHAPES: { w: number; h: number; minW: number; minH: number }[] = [
  { w: 191, h: 100, minW: 600, minH: 314 },
  { w: 16, h: 9, minW: 600, minH: 337 },
  { w: 1, h: 1, minW: 600, minH: 600 },
  { w: 4, h: 5, minW: 600, minH: 750 },
  { w: 2, h: 3, minW: 600, minH: 900 },
  { w: 9, h: 16, minW: 600, minH: 1066 },
];

/** The shape cards are cropped to: 1.91:1, the standard X image card. */
export const X_CARD_SIZE = { width: 1200, height: 628 } as const;

/** True when X accepts the image as is (ratio within 1%, at least the minimum size). */
export function fitsXCard(width: number, height: number): boolean {
  if (!width || !height) return false;
  return X_CARD_SHAPES.some(
    (s) => width >= s.minW && height >= s.minH && Math.abs(width / height - s.w / s.h) / (s.w / s.h) <= 0.01
  );
}

/**
 * The image, or a 1200x628 centre crop of it when X would refuse its shape.
 * `null` means the original is fine. Crops keep the most detailed region
 * (sharp's "attention" strategy) and are JPEG.
 */
export async function cropForXCard(bytes: Uint8Array): Promise<Uint8Array | null> {
  const meta = await sharp(bytes).rotate().metadata();
  // EXIF orientation may swap the visible width and height.
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = swapped ? meta.height ?? 0 : meta.width ?? 0;
  const height = swapped ? meta.width ?? 0 : meta.height ?? 0;
  if (fitsXCard(width, height)) return null;
  const out = await sharp(bytes)
    .rotate()
    .resize(X_CARD_SIZE.width, X_CARD_SIZE.height, { fit: "cover", position: "attention" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(out);
}
