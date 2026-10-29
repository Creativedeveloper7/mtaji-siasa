import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getRepositories, usesTracker } from "@/server";
import type { ContentResult } from "@/server/content/service";
import { asString, isRecord } from "@/server/content/parse";
import { AD_LIMITS } from "@/server/tracker/adly/config";
import { fetchPublicImage, IMAGE_MAX_BYTES } from "@/server/tracker/adly/safe-fetch";
import { cropForXCard, fitsXCard } from "@/server/tracker/adly/x-card-image";
import { describeProblems, reviewCopyForX, xCopyProblems, type AdCopy, type CopyContext } from "@/server/ads/x-policy";
import { aiCheckImage, aiReviewConfigured, aiReviewCopy } from "@/server/ads/x-policy-ai";
import type { AdImageCheck, AdPolicyFinding, AdPolicyReview, Project } from "@/types";
import type { AuthSession } from "@/types/auth";

/** X image cards need at least 600 px across. */
const MIN_WIDTH = 600;
/** How many other project photos Adly checks when the chosen one can't be used. */
const MAX_ALTERNATIVES = 4;

export function copyContext(project: Project): CopyContext {
  return {
    projectName: project.name,
    county: project.county || undefined,
    status: project.status,
    limits: { headline: AD_LIMITS.headline, body: AD_LIMITS.body },
  };
}

/** Photos an ad for this project may use: the cover, then its media posts and their galleries. */
export async function projectAdImages(project: Project): Promise<string[]> {
  const media = project.mediaIds.length ? await getRepositories().content.listMediaByIds(project.mediaIds) : [];
  const urls = [project.image, ...media.filter((m) => m.type === "image").flatMap((m) => [m.image, ...(m.gallery ?? [])])];
  return Array.from(new Set(urls.filter((u): u is string => Boolean(u && u.trim()))));
}

/** The project, when this account may advertise it. */
export async function ownProject(session: AuthSession, projectId: string): Promise<Project | null> {
  const content = getRepositories().content;
  const project = await content.findProject(projectId);
  if (!project) return null;
  if (usesTracker()) {
    // Ownership rule: the project's owner auth user id (docs/tracker-backend.md).
    const owner = await content.projectOwnerUserId?.(project.id);
    return owner && owner === session.userId ? project : null;
  }
  return session.leaderId && project.leaderIds.includes(session.leaderId) ? project : null;
}

async function loadImage(url: string): Promise<Uint8Array> {
  if (url.startsWith("data:image/")) {
    const base64 = url.slice(url.indexOf(",") + 1);
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  if (url.startsWith("/") && !url.startsWith("//")) {
    // Memory store: images under public/.
    const root = path.join(process.cwd(), "public");
    const file = path.normalize(path.join(root, decodeURIComponent(url.split("?")[0])));
    if (!file.startsWith(root + path.sep)) throw new Error("Image path outside public/.");
    return new Uint8Array(await readFile(file));
  }
  return (await fetchPublicImage(url, { maxBytes: IMAGE_MAX_BYTES })).bytes;
}

async function jpegDataUrl(bytes: Uint8Array, width: number): Promise<string> {
  const out = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/** Size and shape (always), and what is in it (when the AI review is on). */
export async function checkImage(url: string, useAi: boolean): Promise<AdImageCheck> {
  let bytes: Uint8Array;
  try {
    bytes = await loadImage(url);
  } catch {
    return { url, ok: false, notes: ["Adly could not open this photo. Upload it again, as a JPEG or PNG under 5 MB."] };
  }
  try {
    const meta = await sharp(bytes).rotate().metadata();
    const swapped = (meta.orientation ?? 1) >= 5;
    const width = (swapped ? meta.height : meta.width) ?? 0;
    const height = (swapped ? meta.width : meta.height) ?? 0;
    const notes: string[] = [];
    let ok = true;
    if (width < MIN_WIDTH) {
      ok = false;
      notes.push(`It is ${width}×${height} px; X image cards need a photo at least ${MIN_WIDTH} px wide.`);
    }
    const willCrop = ok && !fitsXCard(width, height);
    const shown = willCrop ? ((await cropForXCard(bytes)) ?? bytes) : bytes;
    const previewDataUrl = await jpegDataUrl(shown, 480);
    if (willCrop) notes.push("X only shows certain shapes, so Adly crops it to 1200×628. Check the crop still shows what matters.");
    if (ok && useAi) {
      const seen = await aiCheckImage(await jpegDataUrl(shown, 768));
      if (seen && !seen.ok) {
        ok = false;
        notes.push(...seen.issues);
      }
    }
    return { url, ok, width, height, willCrop, previewDataUrl, notes };
  } catch {
    return { url, ok: false, notes: ["This file isn't an image Adly can read. Use a JPEG or PNG."] };
  }
}

function copyFromBody(body: Record<string, unknown>): AdCopy {
  return {
    headline: (asString(body.headline) ?? "").trim(),
    body: (asString(body.body) ?? "").trim(),
    keywords: (Array.isArray(body.keywords) ? body.keywords : [])
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean),
  };
}

function sameCopy(a: AdCopy, b: AdCopy): boolean {
  return a.headline === b.headline && a.body === b.body && a.keywords.join("\n") === b.keywords.join("\n");
}

/** Copy review: the rules, then (when configured) the AI rewrite, kept only if the rules pass it. */
async function reviewCopy(copy: AdCopy, context: CopyContext, useAi: boolean): Promise<{ findings: AdPolicyFinding[]; suggested: AdCopy; ai: boolean }> {
  const rules = reviewCopyForX(copy, context);
  if (!useAi) return { ...rules, ai: false };
  const ai = await aiReviewCopy(copy, context);
  if (!ai) return { ...rules, ai: false };
  const rewrite: AdCopy = {
    headline: ai.rewrite.headline,
    body: ai.rewrite.body,
    keywords: ai.rewrite.keywords,
  };
  const fits = rewrite.headline.length <= context.limits.headline && rewrite.body.length <= context.limits.body;
  const passes = fits && xCopyProblems(rewrite, context).length === 0;
  const aiFindings: AdPolicyFinding[] = ai.issues
    // The rules already explain what they caught; add what only the AI saw.
    .filter((i) => !rules.findings.some((f) => f.field === i.field && i.found.toLowerCase().includes(f.found.toLowerCase())))
    .map((i) => ({ rule: "unproven_claim" as const, field: i.field, severity: "fix" as const, found: i.found, why: i.why }));
  if (!rules.findings.length && !aiFindings.length) return { findings: [], suggested: copy, ai: true };
  if (!passes) return { ...rules, ai: true };
  // The AI rewrite replaces the rules' edits, so describe the change once per field.
  const findings = [...rules.findings, ...aiFindings].map((f) => ({
    ...f,
    change: f.field === "keywords" ? f.change : `Adly rewrote the ${f.field === "headline" ? "headline" : "text"}`,
  }));
  return { findings, suggested: rewrite, ai: true };
}

/**
 * POST /api/ads/review: Adly's X policy review of a draft ad.
 * Body: { projectId, headline, body, keywords, imageUrl? }.
 */
export async function reviewAdForX(session: AuthSession, body: unknown): Promise<ContentResult> {
  if (!["leader", "aspirant", "admin"].includes(session.role)) {
    return { ok: false, status: 403, error: "Only leaders and aspirants can run ads." };
  }
  if (!isRecord(body)) return { ok: false, status: 400, error: "Send the draft ad as JSON." };
  const project = await ownProject(session, asString(body.projectId) ?? "");
  if (!project) return { ok: false, status: 400, error: "Choose one of your own projects to promote." };

  const copy = copyFromBody(body);
  const context = copyContext(project);
  const images = await projectAdImages(project);
  const requested = asString(body.imageUrl);
  // Only the project's own photos: the URL is fetched server-side.
  const imageUrl = requested && images.includes(requested) ? requested : images[0] ?? "";
  const useAi = aiReviewConfigured();

  const [copyReview, image] = await Promise.all([
    reviewCopy(copy, context, useAi),
    imageUrl ? checkImage(imageUrl, useAi) : Promise.resolve<AdImageCheck>({ url: "", ok: false, notes: ["This project has no photo yet."] }),
  ]);

  const findings = [...copyReview.findings];
  let alternatives: AdImageCheck[] = [];
  let suggestedImage = imageUrl;
  if (!image.ok) {
    alternatives = await Promise.all(images.filter((u) => u !== imageUrl).slice(0, MAX_ALTERNATIVES).map((u) => checkImage(u, useAi)));
    const usable = alternatives.find((a) => a.ok);
    if (usable) suggestedImage = usable.url;
    findings.push({
      rule: "image",
      field: "image",
      severity: "fix",
      found: "The chosen photo",
      why: image.notes.join(" "),
      change: usable ? "Switched to another photo of this project" : undefined,
    });
  } else if (image.willCrop) {
    findings.push({ rule: "image", field: "image", severity: "advice", found: "Photo shape", why: image.notes.join(" ") });
  }
  if (!useAi) {
    findings.push({
      rule: "image",
      field: "image",
      severity: "advice",
      found: "What's in the photo",
      why: "Adly checks the photo's size and shape, not what it shows. Make sure it has no officials or uniforms, party colours, campaign posters, flags, cash or shocking scenes, and little or no text.",
    });
  }

  const original = { ...copy, imageUrl };
  const suggested = { ...copyReview.suggested, imageUrl: suggestedImage };
  const usableImage = image.ok || alternatives.some((a) => a.ok);
  const review: AdPolicyReview = {
    network: "x",
    status: !usableImage ? "needs_image" : sameCopy(copy, copyReview.suggested) && suggestedImage === imageUrl ? "clear" : "changed",
    findings,
    original,
    suggested,
    image,
    alternatives,
    checkedBy: copyReview.ai || useAi ? "rules+ai" : "rules",
  };
  return { ok: true, status: 200, body: { ok: true, review } };
}

/**
 * Server-side guard for create and publish: the message to refuse an X ad
 * with, or null when its copy passes. The composer runs the full review
 * first, so this only trips when someone skips Adly's version.
 */
export function xPolicyError(project: Project | undefined, copy: AdCopy, fallbackName: string): string | null {
  const context = project
    ? copyContext(project)
    : { projectName: fallbackName, limits: { headline: AD_LIMITS.headline, body: AD_LIMITS.body } };
  const problems = xCopyProblems(copy, context);
  if (!problems.length) return null;
  return `Adly stopped this ad before it went to X, which would likely reject it for: ${describeProblems(problems)}. Open the ad composer and let Adly review it, or run it on Google only.`;
}

/** The image to use: one of the project's own photos, else its cover. */
export async function chosenAdImage(project: Project, requested: unknown): Promise<string> {
  const url = asString(requested);
  if (!url || url === project.image) return project.image;
  return (await projectAdImages(project)).includes(url) ? url : project.image;
}
