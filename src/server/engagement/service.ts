import { getRepositories } from "@/server";
import { isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";
import type { AdlyInterestLead } from "@/server/domain";
import type { AuthSession } from "@/types/auth";

const INTEREST_ROLES = [
  "Politician",
  "Aspirant",
  "Campaign Team",
  "Organization",
  "Other",
] as const;

const INTEREST_TOPICS = [
  "Advertising",
  "Campaign Posters",
  "Project Timelapses",
  "AI Simulations",
  "Campaign Analytics",
  "Other",
] as const;

function fail(status: number, error: string): ContentResult {
  return { ok: false, status, error };
}

export function readSavedOpportunities(session: AuthSession): ContentResult {
  const ids = getRepositories().engagement.getSavedOpportunityIds(session.userId);
  return { ok: true, status: 200, body: { ok: true, ids } };
}

export function saveOpportunities(session: AuthSession, body: unknown): ContentResult {
  if (!isRecord(body) || !Array.isArray(body.ids)) {
    return fail(400, "ids must be a list of opportunity ids.");
  }
  const ids = body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
  const known = new Set(getRepositories().content.listOpportunities().map((item) => item.id));
  const unknown = ids.find((id) => !known.has(id));
  if (unknown) return fail(400, "One or more opportunities were not found.");
  const saved = getRepositories().engagement.setSavedOpportunityIds(session.userId, ids);
  return { ok: true, status: 200, body: { ok: true, ids: saved } };
}

export function submitAdlyInterest(body: unknown): ContentResult {
  if (!isRecord(body)) return fail(400, "Interest body must be an object.");
  const fullName = text(body.fullName);
  const email = text(body.email)?.toLowerCase();
  const phone = text(body.phone);
  const organization = text(body.organization) ?? "";
  if (!fullName || !email || !phone) {
    return fail(400, "Name, email, and phone are required.");
  }
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return fail(400, "Enter a valid email address.");
  }
  if (typeof body.role !== "string" || !INTEREST_ROLES.includes(body.role as (typeof INTEREST_ROLES)[number])) {
    return fail(400, "Choose a role.");
  }
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((item): item is string => typeof item === "string")
    : [];
  if (interests.some((item) => !INTEREST_TOPICS.includes(item as (typeof INTEREST_TOPICS)[number]))) {
    return fail(400, "Choose interests from the Adly list.");
  }
  const lead = getRepositories().engagement.addAdlyInterest({
    fullName,
    email,
    phone,
    organization,
    role: body.role,
    interests,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, status: 201, body: { ok: true, lead: publicLead(lead) } };
}

export function listAdlyInterests(): ContentResult {
  const leads = getRepositories().engagement.listAdlyInterests().map(publicLead);
  return { ok: true, status: 200, body: { ok: true, leads } };
}

function publicLead(lead: AdlyInterestLead) {
  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    organization: lead.organization,
    role: lead.role,
    interests: lead.interests,
    createdAt: lead.createdAt,
  };
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
