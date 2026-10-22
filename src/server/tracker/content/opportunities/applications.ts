import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityApplication } from "@/types";
import type { ApplicationRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { isUuid } from "@/server/tracker/slug";
import {
  applicationFromRow,
  applicationInsertRow,
  applicationReviewPatch,
  type ApplicationRow,
} from "./mapping";
import {
  check,
  currentUserId,
  defaultClients,
  isCheckViolation,
  isUniqueViolation,
  TrackerWriteError,
  writeWithExtra,
  type OpportunityClients,
} from "./support";

/**
 * ApplicationRepository plus the session-scoped reads the service layer
 * should use. Every method except listAll() runs on the signed-in user's
 * client, so RLS (`opportunity_applications_select`) limits rows to
 * applications the user sent or received on their own listings.
 */
export interface TrackerApplicationRepository extends Promisified<ApplicationRepository> {
  /** Applications the signed-in user sent. `applicantId` must be that user. */
  listForApplicant(applicantId: string): Promise<OpportunityApplication[]>;
  /** Applications received on listings authored by `authorId` (an auth user id, the signed-in user). */
  listForAuthor(authorId: string): Promise<OpportunityApplication[]>;
  /** Applications on one listing. RLS returns rows only to its author (and each applicant their own). */
  listForOpportunity(opportunityId: string): Promise<OpportunityApplication[]>;
  /** Admin only: every application. Uses the service role. */
  listAll(): Promise<OpportunityApplication[]>;
}

const ORDER = { ascending: false } as const;

function rows(data: unknown): OpportunityApplication[] {
  return ((data ?? []) as ApplicationRow[]).map(applicationFromRow);
}

export function createApplicationRepository(
  clients: OpportunityClients = defaultClients(),
  options: { now?: () => Date } = {}
): TrackerApplicationRepository {
  const state = { extraMissing: false, shortlistMissing: false };
  const now = options.now ?? (() => new Date());

  async function scoped(apply?: (client: SupabaseClient) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const client = await clients.user();
    const { data, error } = apply
      ? await apply(client)
      : await client.from("opportunity_applications").select("*").order("created_at", ORDER);
    check(error, "Could not load applications");
    return rows(data);
  }

  async function findRow(client: SupabaseClient, id: string): Promise<ApplicationRow | undefined> {
    if (!isUuid(id)) return undefined;
    const { data, error } = await client.from("opportunity_applications").select("*").eq("id", id).maybeSingle();
    check(error, "Could not load the application");
    return (data as ApplicationRow | null) ?? undefined;
  }

  async function insert(client: SupabaseClient, item: OpportunityApplication): Promise<OpportunityApplication> {
    const userId = await currentUserId(client);
    if (item.applicantId && item.applicantId !== userId) {
      // The live insert policy does not check applicant_id (M6 adds it), so Siasa does.
      throw new TrackerWriteError("You can only apply as yourself.", "forbidden");
    }
    if (!isUuid(item.opportunityId)) throw new TrackerWriteError("Opportunity not found.", "not_found");
    const values = applicationInsertRow(item, userId);
    const { data, error } = await writeWithExtra(state, (withExtra) =>
      client
        .from("opportunity_applications")
        .insert({
          ...(isUuid(item.id) ? { id: item.id } : {}),
          ...values.base,
          ...(withExtra ? values.extra : {}),
        })
        .select("*")
        .single()
    );
    if (isUniqueViolation(error)) {
      // M6's one-per-user index.
      throw new TrackerWriteError("You have already applied for this opportunity.", error?.code);
    }
    if (error?.code === "42501") {
      // RLS: the listing is not published (closed listings take no applications).
      throw new TrackerWriteError("This opportunity is closed for applications.", error.code);
    }
    check(error, "Could not save the application");
    if (!data) throw new TrackerWriteError("The application was saved but could not be read back.");
    return applicationFromRow(data as unknown as ApplicationRow);
  }

  async function review(client: SupabaseClient, item: OpportunityApplication): Promise<OpportunityApplication> {
    // Only status and review note change. RLS lets only the listing author update.
    const run = (shortlist: boolean) =>
      writeWithExtra(state, (withExtra) => {
        const patch = applicationReviewPatch(item, shortlist);
        return client
          .from("opportunity_applications")
          .update({
            ...patch.base,
            ...(withExtra ? { ...patch.extra, updated_at: now().toISOString() } : {}),
          })
          .eq("id", item.id)
          .select("*");
      });
    let result = await run(!state.shortlistMissing);
    if (isCheckViolation(result.error) && !state.shortlistMissing) {
      // Before M6 the CHECK list has no 'shortlisted': store 'reviewed'.
      // The shortlist is then lost (review_note also arrives with M6).
      state.shortlistMissing = true;
      result = await run(false);
    }
    check(result.error, "Could not update the application");
    const updated = (result.data ?? []) as ApplicationRow[];
    if (!updated.length) {
      throw new TrackerWriteError("Only the publisher of this opportunity can review its applications.", "forbidden");
    }
    return applicationFromRow(updated[0]);
  }

  return {
    /**
     * Applications visible to the signed-in user (sent + received), via RLS.
     * Not "all applications": that is listAll(), for admins.
     */
    list: () => scoped(),

    listForApplicant: async (applicantId) => {
      if (!isUuid(applicantId)) return [];
      return scoped((client) =>
        client.from("opportunity_applications").select("*").eq("applicant_id", applicantId).order("created_at", ORDER)
      );
    },

    listForAuthor: async (authorId) => {
      if (!isUuid(authorId)) return [];
      return scoped((client) =>
        client
          .from("opportunity_applications")
          .select("*, opportunity:opportunities!inner(author_id)")
          .eq("opportunity.author_id", authorId)
          .order("created_at", ORDER)
      );
    },

    listForOpportunity: async (opportunityId) => {
      if (!isUuid(opportunityId)) return [];
      return scoped((client) =>
        client.from("opportunity_applications").select("*").eq("opportunity_id", opportunityId).order("created_at", ORDER)
      );
    },

    listAll: async () => {
      // Service role: no RLS policy grants admins read access to applications.
      // Callers must check session.role === 'admin' first.
      const admin = await clients.service();
      const { data, error } = await admin.from("opportunity_applications").select("*").order("created_at", ORDER);
      check(error, "Could not load applications");
      return rows(data);
    },

    find: async (id) => {
      const client = await clients.user();
      const row = await findRow(client, id);
      return row ? applicationFromRow(row) : undefined;
    },

    upsert: async (item) => {
      const client = await clients.user();
      const existing = await findRow(client, item.id);
      return existing ? review(client, item) : insert(client, item);
    },

    delete: async (id) => {
      if (!isUuid(id)) return false;
      const client = await clients.user();
      // Live: no DELETE policy, so this removes nothing until M6 adds
      // "applicant may withdraw while pending". Returns false then.
      const { data, error } = await client.from("opportunity_applications").delete().eq("id", id).select("id");
      check(error, "Could not withdraw the application");
      return Array.isArray(data) && data.length > 0;
    },
  };
}
