"use client";

/**
 * Photo uploads from the browser: resize on the device, then store the file in
 * Supabase Storage through /api/uploads and keep only its URL.
 * Without Supabase (MTAJI_STORE=memory) the resized photo stays inline as a data URL.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Resize a picked photo in the browser and return it as a data URL. */
export async function fileToDataUrl(
  file: File,
  { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY, keepPng = true } = {}
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG, PNG, WebP or GIF).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image is too large. Please use a file under 8 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image.");
    ctx.drawImage(img, 0, 0, width, height);

    const preferPng = keepPng && (file.type === "image/png" || file.type === "image/gif");
    return preferPng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export type ResizeOptions = { maxDimension?: number; quality?: number; keepPng?: boolean };

/** Resize, upload, and return the URL to save on the record. */
export async function uploadPhoto(file: File, options?: ResizeOptions): Promise<string> {
  const dataUrl = await fileToDataUrl(file, options);
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("file", blob, file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/png" ? ".png" : ".jpg"));
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  const data = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
    fallback?: string;
  };
  if (response.status === 501 && data.fallback === "inline") return dataUrl;
  if (!response.ok || !data.url) {
    throw new Error(data.error || "Could not upload the photo. Check your connection and try again.");
  }
  return data.url;
}
