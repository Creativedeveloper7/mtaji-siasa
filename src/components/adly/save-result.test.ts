import { describe, expect, it } from "vitest";
import { ADLY_SAVE_FAILED, adlySaveResult } from "@/components/adly/save-result";

describe("adlySaveResult", () => {
  it("is ok when the server saved", async () => {
    expect(await adlySaveResult(Promise.resolve({ ok: true, data: {} }))).toEqual({ ok: true });
  });

  it("carries the server's error on a refusal", async () => {
    expect(
      await adlySaveResult(Promise.resolve({ ok: false, data: { error: "You can only save to your own projects." } }))
    ).toEqual({ ok: false, error: "You can only save to your own projects." });
  });

  it("falls back to a generic error without one, and on a network failure", async () => {
    expect(await adlySaveResult(Promise.resolve({ ok: false, data: {} }))).toEqual({ ok: false, error: ADLY_SAVE_FAILED });
    expect(await adlySaveResult(Promise.reject(new TypeError("Failed to fetch")))).toEqual({
      ok: false,
      error: ADLY_SAVE_FAILED,
    });
  });
});
