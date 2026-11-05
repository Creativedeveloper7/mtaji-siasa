import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRepositories, usesTracker } from "@/server";
import { anonClient, hasServiceRole, serviceClient } from "@/server/tracker/clients";
import { callEdgeFunction, isPaystackCheckout } from "@/server/tracker/wallet/service";
import { parseDonationInput, type DonationTarget } from "@/lib/donations";
import { ownerUserIdOf } from "@/server/tracker/content/media/shared";

/**
 * Donations to a project or a leader, paid through the Tracker's Paystack
 * integration and credited to the recipient's wallet.
 *
 * How the Tracker settles a donation (M-taji-Tracker, supabase/): a
 * `payments` row with payment_type 'donation' and a `campaign_id`; when
 * Paystack confirms it (paystack-webhook or verify-paystack-payment),
 * settle_payment_to_wallets credits the wallet of
 * fundraising_campaigns.owner_id as 'crowdfunding'.
 *
 * So the recipient needs a fundraising campaign they own:
 * - a project: the campaign for that project (project_id) owned by the
 *   project's owner (initiatives -> changemakers);
 * - a leader: a general campaign (no project_id) owned by the account behind
 *   the leader profile (political_figures.user_id).
 * Any signed-in user may create a campaign for any project with themselves as
 * owner (RLS checks owner_id = auth.uid() only), so Siasa only ever uses a
 * campaign whose owner is the recipient, never just "a campaign for this
 * project": otherwise a donation could be diverted. When the recipient has
 * none, Siasa creates one for them with the service role (no RLS rule lets
 * anyone but the owner do it), owner taken from the project or leader record,
 * never from the request.
 *
 * Donors pay as guests (the anon key), signed in or not: the donation is the
 * recipient's money, and a guest payment can be verified by whoever returns
 * from Paystack with its reference.
 */

export type DonationResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

function fail<T>(status: number, error: string): DonationResult<T> {
  return { ok: false, status, error };
}

const PLACEHOLDER_EMAIL = "donor@m-taji.co.ke";

/** Who gets the money, resolved on the server. */
interface Recipient {
  ownerId: string;
  /** The project, for a project donation; null for a leader's general campaign */
  projectId: string | null;
  /** Shown on the campaign and in the payment comment */
  title: string;
  /** The public page Paystack sends the donor back to */
  path: string;
}

const NOT_SET_UP = "This page is not set up to receive donations yet.";

async function resolveRecipient(target: DonationTarget): Promise<DonationResult<Recipient>> {
  const content = getRepositories().content;
  if (target.kind === "project") {
    const project = await content.findProject(target.id).catch(() => undefined);
    if (!project) return fail(404, "This project could not be found.");
    const ownerId = await content.projectOwnerUserId?.(project.id).catch(() => undefined);
    if (!ownerId) return fail(503, NOT_SET_UP);
    return {
      ok: true,
      status: 200,
      data: { ownerId, projectId: project.id, title: project.name, path: `/projects/${encodeURIComponent(project.slug)}` },
    };
  }
  const leader = await content.findLeader(target.id).catch(() => undefined);
  if (!leader) return fail(404, "This leader could not be found.");
  // political_figures.user_id: the account behind the profile, whose wallet it is.
  const ownerId = ownerUserIdOf(leader);
  if (!ownerId) return fail(503, NOT_SET_UP);
  return {
    ok: true,
    status: 200,
    data: {
      ownerId,
      projectId: null,
      title: `Support ${`${leader.honorific} ${leader.name}`.trim()}`,
      path: `/leaders/${encodeURIComponent(leader.slug)}`,
    },
  };
}

/** The recipient's active fundraising campaign, created when there is none. */
async function recipientsCampaign(recipient: Recipient): Promise<DonationResult<{ campaignId: string }>> {
  const db: SupabaseClient = anonClient();
  let query = db.from("fundraising_campaigns").select("id").eq("owner_id", recipient.ownerId).eq("status", "active");
  query = recipient.projectId ? query.eq("project_id", recipient.projectId) : query.is("project_id", null);
  const { data, error } = await query.order("created_at", { ascending: true }).limit(1);
  if (error) {
    console.error("[donations] campaign read failed:", error.message);
    return fail(502, "Donations are not available right now. Try again shortly.");
  }
  const existing = (data ?? [])[0] as { id?: string } | undefined;
  if (existing?.id) return { ok: true, status: 200, data: { campaignId: existing.id } };

  if (!hasServiceRole()) return fail(503, NOT_SET_UP);
  // Service role: only the owner may insert under RLS, and the donor is not the
  // owner. owner_id comes from the project or leader record, never from the request.
  const { data: created, error: insertError } = await serviceClient()
    .from("fundraising_campaigns")
    .insert({ project_id: recipient.projectId, owner_id: recipient.ownerId, title: recipient.title.slice(0, 200), status: "active" })
    .select("id")
    .single();
  if (insertError || !created?.id) {
    console.error("[donations] campaign create failed:", insertError?.message);
    return fail(502, "Donations are not available right now. Try again shortly.");
  }
  return { ok: true, status: 201, data: { campaignId: String(created.id) } };
}

/**
 * POST /api/donations: start a Paystack checkout for a donation to a project
 * or a leader. Answers { checkoutUrl, reference }; the browser goes to checkoutUrl.
 */
export async function startDonation(
  body: unknown,
  siteOrigin: string
): Promise<DonationResult<{ checkoutUrl: string; reference: string }>> {
  if (!usesTracker()) return fail(503, "Donations need the M-Taji Tracker backend; this is the sample-data demo.");
  const parsed = parseDonationInput(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const { input } = parsed;

  const recipient = await resolveRecipient(input.target);
  if (!recipient.ok) return recipient;
  const campaign = await recipientsCampaign(recipient.data);
  if (!campaign.ok) return campaign;

  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const res = await callEdgeFunction("initialize-paystack-payment", anonKey, {
    amount: input.amount,
    currency: "KES",
    payment_type: "donation",
    ...(recipient.data.projectId ? { project_id: recipient.data.projectId } : {}),
    campaign_id: campaign.data.campaignId,
    method: input.method,
    payer_email: input.email ?? PLACEHOLDER_EMAIL,
    ...(input.phone ? { payer_phone: input.phone } : {}),
    comment: `Donation: ${recipient.data.title}${input.name ? ` from ${input.name}` : ""} (M-Taji Siasa)`.slice(0, 200),
    redirect_url: `${siteOrigin}${recipient.data.path}?donation=1`,
  });
  if (!res.ok) {
    const message = typeof res.payload.error === "string" ? res.payload.error : "";
    console.error("[donations] initialize failed:", res.status, message.slice(0, 200));
    return fail(502, "Paystack could not start the payment. Try again shortly.");
  }
  const checkoutUrl = String(res.payload.authorization_url ?? res.payload.checkout_url ?? "");
  const reference = String(res.payload.reference ?? res.payload.api_ref ?? "");
  if (!checkoutUrl || !reference || !isPaystackCheckout(checkoutUrl)) {
    return fail(502, "Paystack did not return a checkout page.");
  }
  return { ok: true, status: 201, data: { checkoutUrl, reference } };
}

export interface DonationVerification {
  /** "success" when Paystack took the money; "pending" / "failed" / "abandoned" otherwise */
  status: string;
  amount: number;
  /** The owner's wallet was credited by this check (the webhook may have done it first) */
  walletCredited: boolean;
}

/**
 * POST /api/donations/verify { reference }: after the donor comes back from
 * Paystack, confirm the payment. The Tracker's verify function settles it to
 * the owner's wallet (the webhook does the same; settling twice is a no-op).
 */
export async function verifyProjectDonation(body: unknown): Promise<DonationResult<DonationVerification>> {
  if (!usesTracker()) return fail(503, "Donations need the M-Taji Tracker backend.");
  const reference = body && typeof body === "object" ? (body as Record<string, unknown>).reference : undefined;
  if (typeof reference !== "string" || !/^[\w.-]{6,100}$/.test(reference)) return fail(400, "Missing payment reference.");
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const res = await callEdgeFunction("verify-paystack-payment", anonKey, { reference });
  if (!res.ok) {
    if (res.status === 403) return fail(403, "This payment can only be confirmed by the account that made it.");
    return fail(502, "We couldn't confirm the payment with Paystack yet. It will be confirmed automatically.");
  }
  if (res.payload.payment_type !== "donation") return fail(400, "This is not a donation payment.");
  return {
    ok: true,
    status: 200,
    data: {
      status: String(res.payload.status ?? "unknown"),
      amount: Number(res.payload.amount ?? 0),
      walletCredited: res.payload.wallet_credited === true,
    },
  };
}
