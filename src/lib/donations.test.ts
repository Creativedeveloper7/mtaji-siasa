import { describe, expect, it } from "vitest";
import { parseDonationInput } from "@/lib/donations";

describe("parseDonationInput", () => {
  it("accepts a preset amount with no donor details", () => {
    expect(parseDonationInput({ projectId: "p1", amount: 1000 })).toEqual({
      ok: true,
      input: { target: { kind: "project", id: "p1" }, amount: 1000, method: "M-PESA" },
    });
  });

  it("keeps card, email, a Kenyan phone and the name", () => {
    const r = parseDonationInput({ projectId: "p1", amount: "2500", method: "CARD-PAYMENT", email: "a@b.co", phone: "0712 345-678", name: " Wanjiku " });
    expect(r).toEqual({
      ok: true,
      input: { target: { kind: "project", id: "p1" }, amount: 2500, method: "CARD-PAYMENT", email: "a@b.co", phone: "0712345678", name: "Wanjiku" },
    });
  });

  it("refuses amounts out of range, fractions, bad emails and phones", () => {
    expect(parseDonationInput({ projectId: "p1", amount: 49 })).toMatchObject({ ok: false });
    expect(parseDonationInput({ projectId: "p1", amount: 250_001 })).toMatchObject({ ok: false });
    expect(parseDonationInput({ projectId: "p1", amount: 100.5 })).toMatchObject({ ok: false });
    expect(parseDonationInput({ projectId: "p1", amount: 100, email: "nope" })).toMatchObject({ ok: false });
    expect(parseDonationInput({ projectId: "p1", amount: 100, phone: "12345" })).toMatchObject({ ok: false });
    expect(parseDonationInput({ amount: 100 })).toMatchObject({ ok: false });
    expect(parseDonationInput({ projectId: "p1", leaderId: "l1", amount: 100 })).toMatchObject({ ok: false });
  });

  it("takes a leader as the recipient", () => {
    expect(parseDonationInput({ leaderId: "l1", amount: 500 })).toMatchObject({ ok: true, input: { target: { kind: "leader", id: "l1" } } });
  });
});
