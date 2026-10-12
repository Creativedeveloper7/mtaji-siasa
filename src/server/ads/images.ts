import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Ad networks need fixed shapes: Google responsive display ads need a 1.91:1
 * landscape and a 1:1 square image; X shows 1.91:1 best in the feed.
 * The project photo is centre-cropped to each shape.
 */
export interface AdImages {
  landscape: Buffer; // 1200 x 628
  square: Buffer; // 1200 x 1200
}

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export async function loadImage(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return Buffer.from(url.slice(comma + 1), url.slice(0, comma).includes(";base64") ? "base64" : "utf8");
  }
  if (url.startsWith("/") && !url.startsWith("//")) {
    // A file shipped with the site, e.g. /home/project-road.jpg
    const publicDir = path.join(process.cwd(), "public");
    const file = path.normalize(path.join(publicDir, decodeURIComponent(url.split("?")[0])));
    if (!file.startsWith(publicDir + path.sep)) throw new Error("Invalid project image path.");
    return readFile(file);
  }
  if (!/^https:\/\//i.test(url)) throw new Error("The project image must be an https link or an uploaded photo.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the project image (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("The project image is too large to use in an ad.");
  return bytes;
}

export async function prepareAdImages(url: string): Promise<AdImages> {
  const source = await loadImage(url);
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height || meta.width < 300 || meta.height < 300) {
    throw new Error("The project image must be at least 300 × 300 pixels for ads.");
  }
  const crop = (width: number, height: number) =>
    sharp(source)
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  const [landscape, square] = await Promise.all([crop(1200, 628), crop(1200, 1200)]);
  return { landscape, square };
}
