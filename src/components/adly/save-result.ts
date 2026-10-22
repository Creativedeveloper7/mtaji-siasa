/** Outcome of an Adly studio save (poster, simulation, timelapse, ...). */
export type AdlySaveResult = { ok: true } | { ok: false; error: string };

export const ADLY_SAVE_FAILED = "Could not save. Try again.";

/**
 * The outcome of a save request: the server's own error text on a refusal,
 * and a generic message when the request fails outright (network).
 */
export async function adlySaveResult(
  request: Promise<{ ok: boolean; data: { error?: unknown } | null | undefined }>
): Promise<AdlySaveResult> {
  try {
    const result = await request;
    if (result.ok) return { ok: true };
    const error = result.data?.error;
    return { ok: false, error: typeof error === "string" && error.trim() ? error : ADLY_SAVE_FAILED };
  } catch {
    return { ok: false, error: ADLY_SAVE_FAILED };
  }
}
