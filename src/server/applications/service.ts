import type {
  ApplicationStatus,
  ApplicationView,
  Opportunity,
  OpportunityApplication,
} from "@/types";
import type { AuthSession } from "@/types/auth";
import { createId } from "@/lib/store";
import { resolveOpportunityStatus } from "@/lib/related-content";
import { getRepositories } from "@/server";
import { asString, isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "submitted",
  "reviewing",
  "shortlisted",
  "accepted",
  "rejected",
];

const MAX_MESSAGE = 4000;

function fail(status: number, error: string): ContentResult {
  return { ok: false, status, error };
}

function ok(body: Record<string, unknown>, status = 200): ContentResult {
  return { ok: true, status, body };
}

function view(item: OpportunityApplication, opportunity: Opportunity | undefined): ApplicationView {
  return {
    ...item,
    opportunity: {
      id: item.opportunityId,
      slug: opportunity?.slug ?? "",
      title: opportunity?.title ?? "Removed opportunity",
      category: opportunity?.category ?? "other",
      deadline: opportunity?.deadline ?? "",
      projectId: opportunity?.projectId,
      leaderId: opportunity?.leaderId,
    },
  };
}

async function views(items: OpportunityApplication[]): Promise<ApplicationView[]> {
  const byId = new Map(
    (await getRepositories().content.listOpportunities()).map((item) => [item.id, item])
  );
  return items
    .map((item) => view(item, byId.get(item.opportunityId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function canReview(session: AuthSession, opportunity: Opportunity | undefined): boolean {
  if (session.role === "admin") return true;
  return Boolean(opportunity?.leaderId && session.leaderId && opportunity.leaderId === session.leaderId);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function submitApplication(session: AuthSession, body: unknown): Promise<ContentResult> {
  if (!isRecord(body)) return fail(400, "Application body must be an object.");
  const opportunityId = asString(body.opportunityId);
  if (!opportunityId) return fail(400, "opportunityId is required.");
  const repos = getRepositories();
  const opportunity = await repos.content.findOpportunity(opportunityId);
  if (!opportunity) return fail(404, "Opportunity not found.");
  if (resolveOpportunityStatus(opportunity) === "closed") {
    return fail(400, "This opportunity is closed for applications.");
  }
  if (session.leaderId && opportunity.leaderId === session.leaderId) {
    return fail(400, "You cannot apply for an opportunity you published.");
  }
  if (
    (await repos.applications.list()).some((item) => item.opportunityId === opportunityId && item.applicantId === session.userId)
  ) {
    return fail(409, "You have already applied for this opportunity.");
  }

  const account = await repos.users.findById(session.userId);
  const fullName = asString(body.fullName) ?? account?.fullName ?? session.fullName;
  const email = (asString(body.email) ?? account?.email ?? session.email).toLowerCase();
  const phone = asString(body.phone) ?? account?.phone ?? "";
  const message = asString(body.message) ?? "";
  const attachmentUrl = asString(body.attachmentUrl);
  if (!fullName || !email || !phone) {
    return fail(400, "Name, email, and phone are required.");
  }
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return fail(400, "Enter a valid email address.");
  }
  if (message.length < 20) {
    return fail(400, "Tell the organiser a little about yourself (at least 20 characters).");
  }
  if (message.length > MAX_MESSAGE) {
    return fail(400, `Keep your message under ${MAX_MESSAGE} characters.`);
  }
  if (attachmentUrl && !isHttpUrl(attachmentUrl)) {
    return fail(400, "The CV / portfolio link must start with http:// or https://.");
  }

  const now = new Date().toISOString();
  try {
    const saved = await repos.applications.upsert({
      id: createId("app"),
      opportunityId,
      applicantId: session.userId,
      fullName,
      email,
      phone,
      county: asString(body.county),
      message,
      attachmentUrl,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    });
    return ok({ ok: true, item: view(saved, opportunity) }, 201);
  } catch (error) {
    return fail(409, error instanceof Error ? error.message : "Could not save the application.");
  }
}

/** Applications the signed-in user has sent. */
export async function listMyApplications(session: AuthSession): Promise<ContentResult> {
  const items = (await getRepositories().applications.list()).filter(
    (item) => item.applicantId === session.userId
  );
  return ok({ ok: true, items: await views(items) });
}

/** Applications received on opportunities the signed-in politician published. Admin sees all. */
export async function listReceivedApplications(session: AuthSession): Promise<ContentResult> {
  if (session.role !== "admin" && !session.leaderId) {
    return fail(403, "Your account is not linked to a leader profile.");
  }
  const repos = getRepositories();
  const owned = new Set(
    (await repos.content.listOpportunities())
      .filter((item) => session.role === "admin" || item.leaderId === session.leaderId)
      .map((item) => item.id)
  );
  const items = (await repos.applications.list()).filter((item) => owned.has(item.opportunityId));
  return ok({ ok: true, items: await views(items) });
}

export async function reviewApplication(
  session: AuthSession,
  id: string,
  body: unknown
): Promise<ContentResult> {
  if (!isRecord(body)) return fail(400, "Review body must be an object.");
  const repos = getRepositories();
  const existing = await repos.applications.find(id);
  if (!existing) return fail(404, "Application not found.");
  const opportunity = await repos.content.findOpportunity(existing.opportunityId);
  if (!canReview(session, opportunity)) {
    return fail(403, "Only the publisher of this opportunity can review its applications.");
  }
  const status =
    "status" in body
      ? APPLICATION_STATUSES.find((item) => item === body.status)
      : existing.status;
  if (!status) return fail(400, "Choose a valid application status.");
  const reviewNote = "reviewNote" in body ? asString(body.reviewNote) : existing.reviewNote;
  const saved = await repos.applications.upsert({
    ...existing,
    status,
    reviewNote,
    updatedAt: new Date().toISOString(),
  });
  return ok({ ok: true, item: view(saved, opportunity) });
}

/** The applicant may withdraw while the application has not been reviewed yet. */
export async function withdrawApplication(session: AuthSession, id: string): Promise<ContentResult> {
  const repos = getRepositories();
  const existing = await repos.applications.find(id);
  if (!existing) return fail(404, "Application not found.");
  if (existing.applicantId !== session.userId && session.role !== "admin") {
    return fail(403, "You can only withdraw your own application.");
  }
  if (existing.status !== "submitted" && session.role !== "admin") {
    return fail(400, "This application is already being reviewed and can no longer be withdrawn.");
  }
  await repos.applications.delete(id);
  return ok({ ok: true });
}
