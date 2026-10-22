import type { EngagementRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { isUuid } from "@/server/tracker/slug";
import {
  ADLY_SUBJECT_PREFIX,
  adlyInterestFromRow,
  adlyInterestToRow,
  isAdlyInterestRow,
  type ContactSubmissionRow,
} from "./mapping";
import {
  check,
  currentUserId,
  defaultClients,
  isMissingTable,
  TrackerWriteError,
  type OpportunityClients,
} from "./support";

/**
 * Saved opportunities → `saved_opportunities` (NEW, M8), on the user's
 * session (RLS: own rows only). Adly interest leads → `contact_submissions`.
 */
export function createEngagementRepository(
  clients: OpportunityClients = defaultClients()
): Promisified<EngagementRepository> {
  async function sessionFor(userId: string) {
    const client = await clients.user();
    const uid = await currentUserId(client);
    if (uid !== userId) throw new TrackerWriteError("You can only manage your own saved opportunities.", "forbidden");
    return client;
  }

  return {
    getSavedOpportunityIds: async (userId) => {
      if (!isUuid(userId)) return [];
      const client = await sessionFor(userId);
      const { data, error } = await client
        .from("saved_opportunities")
        .select("opportunity_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      // Before M8 the table does not exist: nothing is saved yet.
      if (isMissingTable(error)) return [];
      check(error, "Could not load saved opportunities");
      return ((data ?? []) as Array<{ opportunity_id: string }>).map((row) => row.opportunity_id);
    },

    setSavedOpportunityIds: async (userId, ids) => {
      const wanted = [...new Set(ids.filter(isUuid))];
      const client = await sessionFor(userId);
      const { data, error } = await client.from("saved_opportunities").select("opportunity_id").eq("user_id", userId);
      if (isMissingTable(error)) {
        throw new TrackerWriteError("Saving opportunities needs Tracker migration M8 (saved_opportunities).", error?.code);
      }
      check(error, "Could not load saved opportunities");
      const current = new Set(((data ?? []) as Array<{ opportunity_id: string }>).map((row) => row.opportunity_id));
      const removed = [...current].filter((id) => !wanted.includes(id));
      const added = wanted.filter((id) => !current.has(id));
      if (removed.length) {
        const result = await client
          .from("saved_opportunities")
          .delete()
          .eq("user_id", userId)
          .in("opportunity_id", removed);
        check(result.error, "Could not update saved opportunities");
      }
      if (added.length) {
        const result = await client
          .from("saved_opportunities")
          .upsert(
            added.map((opportunity_id) => ({ user_id: userId, opportunity_id })),
            { onConflict: "user_id,opportunity_id", ignoreDuplicates: true }
          );
        check(result.error, "Could not update saved opportunities");
      }
      return wanted;
    },

    listAdlyInterests: async () => {
      // Service role: contact_submissions has no SELECT policy at all.
      // Admin only; the route must check session.role === 'admin' first.
      const admin = await clients.service();
      const { data, error } = await admin
        .from("contact_submissions")
        .select("*")
        .like("subject", `${ADLY_SUBJECT_PREFIX}%`)
        .order("created_at", { ascending: false });
      check(error, "Could not load Adly interest leads");
      return ((data ?? []) as ContactSubmissionRow[]).filter(isAdlyInterestRow).map(adlyInterestFromRow);
    },

    addAdlyInterest: async (input) => {
      const lead = { ...input, id: input.id && isUuid(input.id) ? input.id : crypto.randomUUID() };
      const row = adlyInterestToRow(lead);
      const client = await clients.anon();
      // Insert is open to anyone. No `.select()`: there is no SELECT policy, so
      // RETURNING would be refused. The id is generated here instead.
      const { error } = await client.from("contact_submissions").insert(row);
      check(error, "Could not send your details");
      return lead;
    },
  };
}
