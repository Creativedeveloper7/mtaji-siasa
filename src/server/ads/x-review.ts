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
import {
  describeProblems,
  imageNameMismatch,
  imageTextProblems,
  opportunityProblemsForX,
  reviewCopyForX,
  suggestLandingForX,
  xCopyProblems,
  xLandingProblems,
  type AdCopy,
  type CopyContext,
  type LandingPage,
} from "@/server/ads/x-policy";
import { aiCheckImage, aiReviewConfigured, aiReviewCopy, aiRewriteLanding } from "@/server/ads/x-policy-ai";
import type { AdImageCheck, AdPolicyFinding, AdPolicyReview, Leader, Opportunity, Project } from "@/types";
import { ownerUserIdOf } from "@/server/tracker/content/media/shared";
import type { AuthSession } from "@/types/auth";

/** X image cards need at least 600 px across. */
const MIN_WIDTH = 600;
/** How many other project photos Adly checks when the chosen one can't be used. */
const MAX_ALTERNATIVES = 4;

export function copyContext(project: Project, officialNames: string[] = []): CopyContext {
  return {
    projectName: project.name,
    county: project.county || undefined,
    status: project.status,
    limits: { headline: AD_LIMITS.headline, body: AD_LIMITS.body },
    officialNames,
    hasOpportunities: Array.isArray(project.opportunityIds) ? project.opportunityIds.length > 0 : undefined,
  };
}

/**
 * The people behind the project as X's reviewers would see them: the leader
 * the project page shows under "Led by", and the Tracker changemaker name.
 * Only leaders and aspirants run ads, so these are politicians.
 */
export async function projectOfficials(project: Project): Promise<{ names: string[]; leader?: Leader }> {
  let leader: Leader | undefined;
  const id = project.leaderIds?.[0];
  if (id) {
    try {
      leader = await getRepositories().content.findLeader(id);
    } catch {
      // No leader to look at: the check still runs on the changemaker name.
      leader = undefined;
    }
  }
  const names = [leader?.name, project.creatorName].filter((n): n is string => typeof n === "string" && Boolean(n.trim()));
  return { names, leader };
}

/** The "Led by" line on the project page, as X's reviewers see it. */
function leaderBylineAdvice(leader: Leader | undefined): AdPolicyFinding | null {
  if (!leader) return null;
  const byline = `${leader.honorific} ${leader.name}`.trim();
  const office = leader.position?.trim();
  return {
    rule: "political",
    field: "landing",
    severity: "advice",
    found: byline,
    why: `Your project page shows "Led by ${byline}"${office ? ` (${office})` : ""}. X counts an ad whose page names an elected official or a candidate as political content, which it doesn't allow in ads aimed at Kenya, so X may still reject this ad. Keep the project's name and description about the work itself.`,
  };
}

/** National offices a bare position title can be read as. */
const NATIONAL_OFFICE =
  /^(?:the\s+)?(?:president|deputy president|prime cabinet secretary|cabinet secretary|principal secretary|attorney[- ]general|chief justice|speaker|minister)\b/i;

/**
 * The project page shows "Led by Hon. X" with a bare national-office title
 * ("President"). Next to a project, X's reviewers can read it as the national
 * office: a government connection the ad can't show (Deceptive & Fraudulent
 * Content). A qualified title ("President, Mashinani Youth") is fine.
 */
export function officeTitleBlock(leader: Leader | undefined, projectName: string): AdPolicyFinding | null {
  const office = leader?.position?.trim();
  if (!leader || !office || !NATIONAL_OFFICE.test(office)) return null;
  if (/[,—–(]|\s-\s|\bof\b|\bfor\b/i.test(office)) return null;
  const byline = `${leader.honorific} ${leader.name}`.trim();
  return {
    rule: "impersonation",
    field: "landing",
    severity: "block",
    found: `${byline}, ${office}`,
    why: `Your project page shows "Led by ${byline}" and your profile gives your position as "${office}". X's reviewers can read that as the national office, which suggests a government connection the ad can't show (Deceptive & Fraudulent Content).`,
    change: `On your profile, say what you lead, for example "${office}, ${projectName}"`,
  };
}

/** Photos an ad for this project may use: the cover, then its media posts and their galleries. */
export async function projectAdImages(project: Project): Promise<string[]> {
  const media = project.mediaIds?.length ? await getRepositories().content.listMediaByIds(project.mediaIds).catch(() => []) : [];
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

/** What the photo check compares the photo's text with. */
interface ImageContext {
  projectName: string;
  officialNames?: string[];
}

/**
 * Size and shape (always), and what is in it (when the AI review is on): the
 * AI's own judgement, plus the words it reads on the photo, checked with the
 * same political rules as the ad and the project page.
 */
export async function checkImage(url: string, useAi: boolean, context?: ImageContext): Promise<AdImageCheck> {
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
    const advice: string[] = [];
    let text: string | undefined;
    if (ok && useAi) {
      const seen = await aiCheckImage(await jpegDataUrl(shown, 1280));
      if (seen) {
        text = seen.text || undefined;
        if (!seen.ok) {
          ok = false;
          notes.push(...seen.issues);
        }
        const political = imageTextProblems(seen.text, { officialNames: context?.officialNames });
        if (political.length) {
          ok = false;
          notes.push(
            `The photo's text says ${political.map((p) => `"${p}"`).join(", ")}. X reads text on an image as part of the ad, and this is political content, which X doesn't allow in ads aimed at Kenya. Use a real photo of the work, with no logos, slogans or flags.`
          );
        }
        const missing = context ? imageNameMismatch(seen.text, context.projectName) : null;
        if (missing) {
          advice.push(
            `The photo shows a different version of the name than "${context!.projectName}" (no "${missing.join(" ")}"). X treats an ad whose name doesn't match its image and page as misleading: use the same name everywhere.`
          );
        }
      }
    }
    return { url, ok, width, height, willCrop, previewDataUrl, notes, ...(advice.length ? { advice } : {}), ...(text ? { text } : {}) };
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
 * What an ad promotes, as Adly's checks see it: a project, or an opportunity
 * (a job, training, tender ...). The landing page is the project's or the
 * opportunity's own page.
 */
export interface AdSubject {
  kind: "project" | "opportunity";
  id: string;
  /** Project name or opportunity title */
  name: string;
  /** "project" / "opportunity", for messages */
  noun: string;
  /** The landing page path: /projects/<slug> or /opportunities/<slug> */
  path: string;
  /** The project an opportunity belongs to, or the project itself */
  projectId?: string;
  context: CopyContext;
  officials: { names: string[]; leader?: Leader };
  /** What X's reviewers read on the landing page that the owner can edit here */
  page: LandingPage;
  /** Further text on the landing page that is checked for political content */
  extraPages: LandingPage[];
  /** Photos the ad may use; the first is the default */
  images: string[];
  /** Opportunity checks (closed, funding, fee to apply, tenders, discriminatory wording) */
  listingFindings: AdPolicyFinding[];
}

export async function projectSubject(project: Project): Promise<AdSubject> {
  const officials = await projectOfficials(project);
  return {
    kind: "project",
    id: project.id,
    name: project.name,
    noun: "project",
    path: `/projects/${project.slug}`,
    projectId: project.id,
    context: copyContext(project, officials.names),
    officials,
    page: { name: project.name, description: project.description ?? "" },
    extraPages: [],
    images: await projectAdImages(project),
    listingFindings: [],
  };
}

export async function opportunitySubject(opportunity: Opportunity): Promise<AdSubject> {
  const content = getRepositories().content;
  const [leader, project] = await Promise.all([
    opportunity.leaderId ? content.findLeader(opportunity.leaderId).catch(() => undefined) : Promise.resolve(undefined),
    opportunity.projectId ? content.findProject(opportunity.projectId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const names = [leader?.name, project?.creatorName].filter((n): n is string => typeof n === "string" && Boolean(n.trim()));
  const projectImages = project ? await projectAdImages(project) : [];
  const images = Array.from(new Set([opportunity.image, ...projectImages].filter((u): u is string => Boolean(u && u.trim()))));
  return {
    kind: "opportunity",
    id: opportunity.id,
    name: opportunity.title,
    noun: "opportunity",
    path: `/opportunities/${opportunity.slug}`,
    projectId: opportunity.projectId,
    context: {
      projectName: opportunity.title,
      county: opportunity.county || undefined,
      limits: { headline: AD_LIMITS.headline, body: AD_LIMITS.body },
      officialNames: names,
      // The ad is the listing itself, so "jobs" is backed by the page.
      hasOpportunities: true,
    },
    officials: { names, leader },
    page: { name: opportunity.title, description: opportunity.description ?? "" },
    extraPages: [
      {
        name: opportunity.organization ?? "",
        description: [opportunity.eligibility, ...(opportunity.requirements ?? []), ...(opportunity.benefits ?? [])]
          .filter(Boolean)
          .join(". "),
      },
    ],
    images,
    listingFindings: opportunityProblemsForX(opportunity),
  };
}

/** The opportunity, when this account may advertise it (its author, by auth user id). */
export async function ownOpportunity(session: AuthSession, opportunityId: string): Promise<Opportunity | null> {
  if (!opportunityId) return null;
  const opportunity = await getRepositories().content.findOpportunity(opportunityId).catch(() => undefined);
  if (!opportunity) return null;
  if (usesTracker()) return ownerUserIdOf(opportunity) === session.userId ? opportunity : null;
  return session.leaderId && opportunity.leaderId === session.leaderId ? opportunity : null;
}

/** The subject named in a request body ({ projectId } or { opportunityId }), when this account owns it. */
export async function ownSubject(session: AuthSession, body: Record<string, unknown>): Promise<AdSubject | null> {
  const opportunityId = asString(body.opportunityId);
  if (opportunityId) {
    const opportunity = await ownOpportunity(session, opportunityId);
    return opportunity ? opportunitySubject(opportunity) : null;
  }
  const project = await ownProject(session, asString(body.projectId) ?? "");
  return project ? projectSubject(project) : null;
}

/** Political content anywhere on the landing page. */
function landingProblemsFor(subject: AdSubject): AdPolicyFinding[] {
  const found = [subject.page, ...subject.extraPages].flatMap((page) => xLandingProblems(page, subject.context));
  return found.slice(0, 3);
}

/** Everything on the landing page that stops an X ad. */
function landingBlocksFor(subject: AdSubject): { political: AdPolicyFinding[]; blocks: AdPolicyFinding[] } {
  const political = landingProblemsFor(subject);
  const office = officeTitleBlock(subject.officials.leader, subject.name);
  const listing = subject.listingFindings.filter((f) => f.severity === "block");
  return { political, blocks: [...political, ...(office ? [office] : []), ...listing] };
}

/**
 * Adly's version of a political landing page: the AI rewrite when it is on
 * and the rules pass it, else the rules' version.
 */
async function suggestLanding(
  subject: AdSubject,
  useAi: boolean
): Promise<{ page: LandingPage; by: "rules" | "ai" }> {
  const page = subject.page;
  if (useAi) {
    const ai = await aiRewriteLanding(page, subject.context);
    if (ai && xLandingProblems(ai, subject.context).length === 0) return { page: ai, by: "ai" };
  }
  return { page: suggestLandingForX(page, subject.context), by: "rules" };
}

/**
 * POST /api/ads/review: Adly's X policy review of a draft ad.
 * Body: { projectId | opportunityId, headline, body, keywords, imageUrl? }.
 */
export async function reviewAdForX(session: AuthSession, body: unknown): Promise<ContentResult> {
  if (!["leader", "aspirant", "admin"].includes(session.role)) {
    return { ok: false, status: 403, error: "Only leaders and aspirants can run ads." };
  }
  if (!isRecord(body)) return { ok: false, status: 400, error: "Send the draft ad as JSON." };
  const subject = await ownSubject(session, body);
  if (!subject) {
    return {
      ok: false,
      status: 400,
      error: body.opportunityId ? "Choose one of your own opportunities to promote." : "Choose one of your own projects to promote.",
    };
  }

  const copy = copyFromBody(body);
  const { context, officials } = subject;
  const { political, blocks } = landingBlocksFor(subject);
  const imageContext = { projectName: subject.name, officialNames: officials.names };
  const images = subject.images;
  const requested = asString(body.imageUrl);
  // Only the subject's own photos: the URL is fetched server-side.
  const imageUrl = requested && images.includes(requested) ? requested : images[0] ?? "";
  const useAi = aiReviewConfigured();

  const [copyReview, image, landingSuggestion] = await Promise.all([
    reviewCopy(copy, context, useAi),
    imageUrl
      ? checkImage(imageUrl, useAi, imageContext)
      : Promise.resolve<AdImageCheck>({ url: "", ok: false, notes: [`This ${subject.noun} has no photo yet.`] }),
    political.length ? suggestLanding(subject, useAi) : Promise.resolve(null),
  ]);

  const findings = [...blocks, ...copyReview.findings];
  const byline = blocks.length ? null : leaderBylineAdvice(officials.leader);
  if (byline) findings.push(byline);
  findings.push(...subject.listingFindings.filter((f) => f.severity === "advice"));
  for (const note of image.advice ?? []) {
    findings.push({ rule: "image", field: "image", severity: "advice", found: "Name on the photo", why: note });
  }
  let alternatives: AdImageCheck[] = [];
  let suggestedImage = imageUrl;
  if (!image.ok) {
    alternatives = await Promise.all(
      images.filter((u) => u !== imageUrl).slice(0, MAX_ALTERNATIVES).map((u) => checkImage(u, useAi, imageContext))
    );
    const usable = alternatives.find((a) => a.ok);
    if (usable) suggestedImage = usable.url;
    findings.push({
      rule: "image",
      field: "image",
      severity: "fix",
      found: "The chosen photo",
      why: image.notes.join(" "),
      change: usable ? `Switched to another photo of this ${subject.noun}` : undefined,
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
    status: blocks.length
      ? "not_for_x"
      : !usableImage
        ? "needs_image"
        : sameCopy(copy, copyReview.suggested) && suggestedImage === imageUrl ? "clear" : "changed",
    findings,
    original,
    suggested,
    image,
    alternatives,
    checkedBy: copyReview.ai || useAi ? "rules+ai" : "rules",
    ...(landingSuggestion
      ? {
          landing: {
            kind: subject.kind,
            ...(subject.kind === "project" ? { projectId: subject.id } : { opportunityId: subject.id }),
            original: subject.page,
            suggested: landingSuggestion.page,
            by: landingSuggestion.by,
          },
        }
      : {}),
  };
  return { ok: true, status: 200, body: { ok: true, review } };
}

/**
 * Server-side guard for create and publish: the message to refuse an X ad
 * with, or null when it passes. The composer runs the full review first, so
 * this only trips when someone skips Adly's version.
 */
export async function xPolicyErrorFor(subject: AdSubject | undefined, copy: AdCopy, fallbackName: string): Promise<string | null> {
  const context = subject?.context ?? { projectName: fallbackName, limits: { headline: AD_LIMITS.headline, body: AD_LIMITS.body } };
  if (subject) {
    const office = officeTitleBlock(subject.officials.leader, subject.name);
    if (office) return `Adly stopped this ad before it went to X: ${office.why} ${office.change}.`;
    const listing = subject.listingFindings.filter((f) => f.severity === "block");
    if (listing.length) {
      return `Adly stopped this ad before it went to X, which would reject it: ${listing.map((f) => f.why).join(" ")}`;
    }
    const landing = landingProblemsFor(subject);
    if (landing.length) {
      return `Adly stopped this ad before it went to X. X doesn't allow political ads aimed at Kenya, and its reviewers read the ${subject.noun} page the ad links to, which has political content: ${describeProblems(landing)}. Edit the ${subject.noun} so it describes the work itself, or run the ad on Google only.`;
    }
  }
  const problems = xCopyProblems(copy, context);
  if (!problems.length) return null;
  return `Adly stopped this ad before it went to X, which would likely reject it for: ${describeProblems(problems)}. Open the ad composer and let Adly review it, or run it on Google only.`;
}

/** xPolicyErrorFor a project ad. */
export async function xPolicyError(project: Project | undefined, copy: AdCopy, fallbackName: string): Promise<string | null> {
  return xPolicyErrorFor(project ? await projectSubject(project) : undefined, copy, fallbackName);
}

/** The image to use: one of the subject's own photos, else its first. */
export function chosenSubjectImage(subject: AdSubject, requested: unknown): string {
  const url = asString(requested);
  return url && subject.images.includes(url) ? url : subject.images[0] ?? "";
}

/** The image to use: one of the project's own photos, else its cover. */
export async function chosenAdImage(project: Project, requested: unknown): Promise<string> {
  const url = asString(requested);
  if (!url || url === project.image) return project.image;
  return (await projectAdImages(project)).includes(url) ? url : project.image;
}
