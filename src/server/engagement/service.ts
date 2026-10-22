import { getRepositories } from "@/server";
import { isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";
import { failureFromError } from "@/server/http-errors";
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

/** The saved_opportunities table (Tracker migration M8) is not there yet. */
function isSavedTableMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}

function savedFailure(error: unknown, context: string): ContentResult {
  if (isSavedTableMissing(error)) {
    return fail(503, "Saving opportunities is not available yet. Try again later.");
  }
  return failureFromError(error, context);
}

export async function readSavedOpportunities(session: AuthSession): Promise<ContentResult> {
  try {
    const ids = await getRepositories().engagement.getSavedOpportunityIds(session.userId);
    return { ok: true, status: 200, body: { ok: true, ids } };
  } catch (error) {
    return savedFailure(error, "read saved opportunities");
  }
}

export async function saveOpportunities(session: AuthSession, body: unknown): Promise<ContentResult> {
  if (!isRecord(body) || !Array.isArray(body.ids)) {
    return fail(400, "ids must be a list of opportunity ids.");
  }
  const ids = body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
  try {
    const known = new Set((await getRepositories().content.listOpportunities()).map((item) => item.id));
    const unknown = ids.find((id) => !known.has(id));
    if (unknown) return fail(400, "One or more opportunities were not found.");
    const saved = await getRepositories().engagement.setSavedOpportunityIds(session.userId, ids);
    return { ok: true, status: 200, body: { ok: true, ids: saved } };
  } catch (error) {
    return savedFailure(error, "save opportunities");
  }
}

export async function submitAdlyInterest(body: unknown): Promise<ContentResult> {
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
  try {
    const lead = await getRepositories().engagement.addAdlyInterest({
      fullName,
      email,
      phone,
      organization,
      role: body.role,
      interests,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, status: 201, body: { ok: true, lead: publicLead(lead) } };
  } catch (error) {
    return failureFromError(error, "send Adly interest");
  }
}

/** Admin only. The Tracker store checks admin again before it uses the service role. */
export async function listAdlyInterests(session: AuthSession): Promise<ContentResult> {
  if (session.role !== "admin") return fail(403, "Only an admin can see Adly interest leads.");
  try {
    const leads = (await getRepositories().engagement.listAdlyInterests()).map(publicLead);
    return { ok: true, status: 200, body: { ok: true, leads } };
  } catch (error) {
    return failureFromError(error, "list Adly interest leads");
  }
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
