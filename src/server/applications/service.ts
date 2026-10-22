import type {
  ApplicationStatus,
  ApplicationView,
  Opportunity,
  OpportunityApplication,
} from "@/types";
import type { AuthSession } from "@/types/auth";
import { createId } from "@/lib/store";
import { resolveOpportunityStatus } from "@/lib/related-content";
import { getRepositories, usesTracker } from "@/server";
import { asString, isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";
import { failureFromError } from "@/server/http-errors";
import { ownerUserIdOf } from "@/server/tracker/content/media/shared";

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

/**
 * Who published the listing. Tracker: the listing's author (auth user id,
 * Ownership rule). Memory: the leader profile, as in the demo data.
 */
function isPublisher(session: AuthSession, opportunity: Opportunity | undefined): boolean {
  if (!opportunity) return false;
  if (usesTracker()) {
    const author = ownerUserIdOf(opportunity);
    return Boolean(author && author === session.userId);
  }
  return Boolean(opportunity.leaderId && session.leaderId && opportunity.leaderId === session.leaderId);
}

function canReview(session: AuthSession, opportunity: Opportunity | undefined): boolean {
  return session.role === "admin" || isPublisher(session, opportunity);
}

/** Runs a service call; a repository error becomes its HTTP status without database detail. */
async function guarded(context: string, run: () => Promise<ContentResult>): Promise<ContentResult> {
  try {
    return await run();
  } catch (error) {
    return failureFromError(error, context);
  }
}

/** Applications `userId` sent. Tracker: a filtered query under row-level security. */
async function sentBy(userId: string): Promise<OpportunityApplication[]> {
  const repo = getRepositories().applications;
  if (usesTracker() && repo.listForApplicant) return repo.listForApplicant(userId);
  return (await repo.list()).filter((item) => item.applicantId === userId);
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
  return guarded("submit application", () => submit(session, body));
}

async function submit(session: AuthSession, body: unknown): Promise<ContentResult> {
  if (!isRecord(body)) return fail(400, "Application body must be an object.");
  const opportunityId = asString(body.opportunityId);
  if (!opportunityId) return fail(400, "opportunityId is required.");
  const repos = getRepositories();
  const opportunity = await repos.content.findOpportunity(opportunityId);
  if (!opportunity) return fail(404, "Opportunity not found.");
  if (resolveOpportunityStatus(opportunity) === "closed") {
    return fail(400, "This opportunity is closed for applications.");
  }
  if (isPublisher(session, opportunity)) {
    return fail(400, "You cannot apply for an opportunity you published.");
  }
  if ((await sentBy(session.userId)).some((item) => item.opportunityId === opportunityId)) {
    return fail(409, "You have already applied for this opportunity.");
  }

  // The account only pre-fills contact details; the session has the essentials.
  const account = await repos.users.findById(session.userId).catch(() => undefined);
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
}

/** Applications the signed-in user has sent. */
export async function listMyApplications(session: AuthSession): Promise<ContentResult> {
  return guarded("list applications", async () => ok({ ok: true, items: await views(await sentBy(session.userId)) }));
}

/** Applications received on opportunities the signed-in user published. Admin sees all. */
export async function listReceivedApplications(session: AuthSession): Promise<ContentResult> {
  return guarded("list received applications", async () => {
    const repos = getRepositories();
    if (usesTracker()) {
      // Tracker: listings belong to their author's auth user id, so any account
      // that published one sees its applications. listAll() re-checks admin.
      const tracker = repos.applications;
      const items =
        session.role === "admin" && tracker.listAll
          ? await tracker.listAll()
          : tracker.listForAuthor
            ? await tracker.listForAuthor(session.userId)
            : [];
      return ok({ ok: true, items: await views(items) });
    }
    if (session.role !== "admin" && !session.leaderId) {
      return fail(403, "Your account is not linked to a leader profile.");
    }
    const owned = new Set(
      (await repos.content.listOpportunities())
        .filter((item) => session.role === "admin" || item.leaderId === session.leaderId)
        .map((item) => item.id)
    );
    const items = (await repos.applications.list()).filter((item) => owned.has(item.opportunityId));
    return ok({ ok: true, items: await views(items) });
  });
}

export async function reviewApplication(
  session: AuthSession,
  id: string,
  body: unknown
): Promise<ContentResult> {
  return guarded("review application", () => review(session, id, body));
}

async function review(session: AuthSession, id: string, body: unknown): Promise<ContentResult> {
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
  return guarded("withdraw application", () => withdraw(session, id));
}

async function withdraw(session: AuthSession, id: string): Promise<ContentResult> {
  const repos = getRepositories();
  const existing = await repos.applications.find(id);
  if (!existing) return fail(404, "Application not found.");
  if (existing.applicantId !== session.userId && session.role !== "admin") {
    return fail(403, "You can only withdraw your own application.");
  }
  if (existing.status !== "submitted" && session.role !== "admin") {
    return fail(400, "This application is already being reviewed and can no longer be withdrawn.");
  }
  if (!(await repos.applications.delete(id))) {
    // Tracker: opportunity_applications has no DELETE policy until migration
    // M6 ("applicant may withdraw while pending"), so nothing was removed.
    return usesTracker()
      ? fail(501, "Withdrawing an application is not available yet. Contact the publisher instead.")
      : fail(404, "Application not found.");
  }
  return ok({ ok: true });
}
