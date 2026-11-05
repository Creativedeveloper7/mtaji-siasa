import "server-only";
import { getRepositories, usesTracker } from "@/server";
import { anonClient } from "@/server/tracker/clients";
import { callEdgeFunction, isPaystackCheckout } from "@/server/tracker/wallet/service";
import { parseDonationInput, type DonationTarget } from "@/lib/donations";

/**
 * Donations straight to a project or a leader, paid through the Tracker's
 * Paystack integration and credited to the recipient's wallet. No fundraising
 * campaign is involved: those stay the Tracker's own crowdfunding feature.
 *
 * How the Tracker settles it (M-taji-Tracker migration
 * 20261105120000_direct_project_and_leader_donations): a `payments` row with
 * payment_type 'donation' and a `project_id` (or `figure_id` for a leader);
 * when Paystack confirms it (paystack-webhook or verify-paystack-payment),
 * settle_payment_to_wallets credits the owner read from the record itself:
 * initiatives -> changemakers.user_id for a project, political_figures.user_id
 * for a leader. The owner is never taken from the request.
 *
 * Two checks keep money from being taken with no wallet to credit:
 * - donation_recipient_owner (the same lookup settlement uses) must find an
 *   owner. If the function is missing, that migration isn't applied and this
 *   Tracker would refuse to settle a donation without a campaign.
 * - initialize-paystack-payment must answer `recipient_checked`: an older
 *   deployment ignores figure_id and doesn't check the recipient, so Siasa
 *   doesn't send the donor to its checkout (the pending payment row is
 *   simply never paid).
 *
 * Donors pay as guests (the anon key), signed in or not: the donation is the
 * recipient's money, and a guest payment can be verified by whoever returns
 * from Paystack with its reference.
 */

export type DonationResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; reason?: NotSetUpReason };

/**
 * Why a page can't take donations, sent next to the message (no secrets) so
 * whoever runs the site can tell the setup steps apart:
 * - tracker_migration_missing: donation_recipient_owner isn't in the database
 * - payment_function_outdated: initialize-paystack-payment isn't the version
 *   that handles direct donations
 * - no_owner: the project or leader has no account to pay
 */
export type NotSetUpReason = "tracker_migration_missing" | "payment_function_outdated" | "no_owner";

function fail<T>(status: number, error: string, reason?: NotSetUpReason): DonationResult<T> {
  return reason ? { ok: false, status, error, reason } : { ok: false, status, error };
}

const PLACEHOLDER_EMAIL = "donor@m-taji.co.ke";
const NOT_SET_UP = "This page is not set up to receive donations yet.";

/** The record a donation is for, resolved on the server. */
interface Recipient {
  /** Sent to the Tracker: { project_id } or { figure_id } */
  ref: { project_id: string } | { figure_id: string };
  /** Shown in the payment comment */
  title: string;
  /** The public page Paystack sends the donor back to */
  path: string;
}

async function resolveRecipient(target: DonationTarget): Promise<DonationResult<Recipient>> {
  const content = getRepositories().content;
  if (target.kind === "project") {
    const project = await content.findProject(target.id).catch(() => undefined);
    if (!project) return fail(404, "This project could not be found.");
    return {
      ok: true,
      status: 200,
      data: { ref: { project_id: project.id }, title: project.name, path: `/projects/${encodeURIComponent(project.slug)}` },
    };
  }
  const leader = await content.findLeader(target.id).catch(() => undefined);
  if (!leader) return fail(404, "This leader could not be found.");
  return {
    ok: true,
    status: 200,
    data: {
      ref: { figure_id: leader.id },
      title: `${leader.honorific} ${leader.name}`.trim(),
      path: `/leaders/${encodeURIComponent(leader.slug)}`,
    },
  };
}

/** The account settlement will pay, by the Tracker's own rule; null when there is none. */
async function recipientOwner(recipient: Recipient): Promise<DonationResult<string | null>> {
  const args =
    "project_id" in recipient.ref
      ? { p_project_id: recipient.ref.project_id, p_figure_id: null }
      : { p_project_id: null, p_figure_id: recipient.ref.figure_id };
  const { data, error } = await anonClient().rpc("donation_recipient_owner", args);
  if (error) {
    // PGRST202 / 42883: the function doesn't exist, so the Tracker can't settle direct donations yet.
    console.error(
      `[donations] donation_recipient_owner failed (${error.code ?? "?"}): ${error.message}. Apply the M-taji-Tracker migration 20261105120000_direct_project_and_leader_donations.`
    );
    return fail(503, NOT_SET_UP, "tracker_migration_missing");
  }
  return { ok: true, status: 200, data: typeof data === "string" && data ? data : null };
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
  const owner = await recipientOwner(recipient.data);
  if (!owner.ok) return owner;
  if (!owner.data) {
    console.error(`[donations] "${recipient.data.title}" has no owner account, so there is no wallet to pay.`);
    return fail(503, NOT_SET_UP, "no_owner");
  }

  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const res = await callEdgeFunction("initialize-paystack-payment", anonKey, {
    amount: input.amount,
    currency: "KES",
    payment_type: "donation",
    ...recipient.data.ref,
    method: input.method,
    payer_email: input.email ?? PLACEHOLDER_EMAIL,
    ...(input.phone ? { payer_phone: input.phone } : {}),
    comment: `Donation to ${recipient.data.title}${input.name ? ` from ${input.name}` : ""} (M-Taji Siasa)`.slice(0, 200),
    redirect_url: `${siteOrigin}${recipient.data.path}?donation=1`,
  });
  if (!res.ok) {
    const message = typeof res.payload.error === "string" ? res.payload.error : "";
    console.error("[donations] initialize failed:", res.status, message.slice(0, 200));
    if (res.status === 400 && /not set up/i.test(message)) return fail(503, NOT_SET_UP, "no_owner");
    return fail(502, "Paystack could not start the payment. Try again shortly.");
  }
  if (res.payload.recipient_checked !== true) {
    console.error(
      "[donations] initialize-paystack-payment did not confirm the recipient: deploy the M-taji-Tracker version that supports direct donations."
    );
    return fail(503, NOT_SET_UP, "payment_function_outdated");
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
