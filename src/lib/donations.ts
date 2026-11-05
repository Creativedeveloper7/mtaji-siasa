/**
 * Donation form input, checked on the server. Kept free of runtime imports so
 * it can be unit tested on its own.
 */

/** Amounts the donate form offers (KES). */
export const DONATION_PRESETS_KES = [100, 500, 1000, 2500, 5000, 10000] as const;
export const MIN_DONATION_KES = 50;
/** M-Pesa's single-transaction limit; card donations above it are rare enough to cap too. */
export const MAX_DONATION_KES = 250_000;

export type DonationMethod = "M-PESA" | "CARD-PAYMENT";

/** Who receives the donation: a project (its owner's wallet) or a leader (their own wallet). */
export type DonationTarget = { kind: "project"; id: string } | { kind: "leader"; id: string };

export interface DonationInput {
  target: DonationTarget;
  amount: number;
  method: DonationMethod;
  /** For the Paystack receipt; optional (anonymous donations use a placeholder). */
  email?: string;
  /** Kenyan number for M-Pesa; optional, Paystack asks for it on checkout too. */
  phone?: string;
  /** Shown to the project owner when given. */
  name?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseDonationInput(body: unknown): { ok: true; input: DonationInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the donation as JSON." };
  const b = body as Record<string, unknown>;
  const projectId = typeof b.projectId === "string" ? b.projectId.trim() : "";
  const leaderId = typeof b.leaderId === "string" ? b.leaderId.trim() : "";
  if (Boolean(projectId) === Boolean(leaderId)) return { ok: false, error: "Choose a project or a leader to donate to." };
  const target: DonationTarget = projectId ? { kind: "project", id: projectId } : { kind: "leader", id: leaderId };
  const amount = typeof b.amount === "number" ? b.amount : Number(b.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return { ok: false, error: "Enter the amount in whole shillings." };
  if (amount < MIN_DONATION_KES) return { ok: false, error: `The smallest donation is KES ${MIN_DONATION_KES}.` };
  if (amount > MAX_DONATION_KES) return { ok: false, error: `The largest single donation is KES ${MAX_DONATION_KES.toLocaleString()}.` };
  const method: DonationMethod = b.method === "CARD-PAYMENT" ? "CARD-PAYMENT" : "M-PESA";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (email && (!EMAIL.test(email) || email.length > 200)) return { ok: false, error: "Enter a valid email address, or leave it empty." };
  const phone = typeof b.phone === "string" ? b.phone.replace(/[\s-]/g, "") : "";
  if (phone && !/^(?:\+?254|0)?[17]\d{8}$/.test(phone)) return { ok: false, error: "Enter a Kenyan phone number, e.g. 0712 345 678, or leave it empty." };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  return {
    ok: true,
    input: { target, amount, method, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(name ? { name } : {}) },
  };
}
