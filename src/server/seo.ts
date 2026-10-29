import "server-only";
import type { Metadata } from "next";
import { getRepositories } from "@/server";
import { canonicalSiteUrl, isAdNetworkLandingUrl, TRACKER_PUBLIC_ORIGIN } from "@/server/tracker/adly/plan";
import type { Leader, Project } from "@/types";

/**
 * Per-page title, description and image in the server HTML. Crawlers (X ad
 * review, WhatsApp, Facebook) do not run the client app, so without these
 * every project and leader page looks like the same generic home page.
 */

/** Public address of the site: PUBLIC_SITE_URL when it is a real https site, else the live domain. */
export function siteUrl(): string {
  const configured = (process.env.PUBLIC_SITE_URL ?? "").trim();
  return canonicalSiteUrl(isAdNetworkLandingUrl(configured) ? configured : TRACKER_PUBLIC_ORIGIN);
}

function clip(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, "")}…`;
}

/** Only real image URLs (no inline data: uploads, which crawlers cannot fetch). */
function imageUrl(src: string | undefined): string | undefined {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return undefined;
  try {
    return new URL(src, siteUrl()).toString();
  } catch {
    return undefined;
  }
}

function pageMetadata(input: { title: string; description: string; path: string; image?: string; type?: "article" | "profile" }): Metadata {
  const url = `${siteUrl()}${input.path}`;
  const image = imageUrl(input.image);
  const images = image ? [{ url: image, alt: input.title }] : undefined;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: input.type ?? "article",
      url,
      siteName: "M-Taji Siasa",
      title: input.title,
      description: input.description,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      images: image ? [image] : undefined,
    },
  };
}

/** A route segment may be a slug or (from Tracker-made links) the record id. */
async function findBySlugOrId<T>(
  bySlug: (slug: string) => Promise<T | undefined>,
  byId: (id: string) => Promise<T | undefined>,
  key: string
): Promise<T | undefined> {
  try {
    return (await bySlug(key)) ?? (await byId(key));
  } catch {
    return undefined;
  }
}

export async function findPublicProject(key: string): Promise<Project | undefined> {
  const content = getRepositories().content;
  return findBySlugOrId((s) => content.findProjectBySlug(s), (id) => content.findProject(id), key);
}

export async function findPublicLeader(key: string): Promise<Leader | undefined> {
  const content = getRepositories().content;
  return findBySlugOrId((s) => content.findLeaderBySlug(s), (id) => content.findLeader(id), key);
}

export async function projectMetadata(key: string): Promise<Metadata> {
  const project = await findPublicProject(key);
  if (!project) return {};
  const place = [project.location, project.county && !project.location.includes(project.county) ? `${project.county} County` : ""]
    .filter(Boolean)
    .join(", ");
  return pageMetadata({
    title: project.name,
    description: clip(project.description || `${project.name}${place ? ` in ${place}` : ""}. Follow progress on M-Taji Siasa.`, 200),
    path: `/projects/${project.slug}`,
    image: project.image,
  });
}

export async function leaderMetadata(key: string): Promise<Metadata> {
  const leader = await findPublicLeader(key);
  if (!leader) return {};
  const name = `${leader.honorific} ${leader.name}`.trim();
  return pageMetadata({
    title: name,
    description: clip(leader.shortBio || leader.bio || `${name}, ${leader.position}. Projects and updates on M-Taji Siasa.`, 200),
    path: `/leaders/${leader.slug}`,
    image: leader.coverImage || leader.photo,
    type: "profile",
  });
}
