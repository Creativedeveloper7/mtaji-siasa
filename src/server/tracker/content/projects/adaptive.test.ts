import { describe, expect, it, vi } from "vitest";
import { carriesData, missingColumnName, writeAdaptive } from "./adaptive";

describe("missingColumnName", () => {
  it("reads the column from PostgREST and Postgres messages", () => {
    expect(
      missingColumnName({ code: "PGRST204", message: "Could not find the 'start_date' column of 'initiatives' in the schema cache" })
    ).toBe("start_date");
    expect(
      missingColumnName({ code: "42703", message: 'column "progress_percent" of relation "initiatives" does not exist' })
    ).toBe("progress_percent");
    expect(missingColumnName({ code: "42703", message: "column initiatives.start_date does not exist" })).toBe("start_date");
  });

  it("is null for other errors", () => {
    expect(missingColumnName(null)).toBeNull();
    expect(missingColumnName({ code: "42501", message: "new row violates row-level security policy" })).toBeNull();
    expect(missingColumnName({ code: "23514", message: "violates check constraint" })).toBeNull();
  });
});

describe("writeAdaptive", () => {
  const NEW = ["start_date", "progress_percent"] as const;

  it("retries once without the whole NEW group when one of them is named", async () => {
    const attempt = vi.fn(async (payload: Record<string, unknown>) =>
      "start_date" in payload || "progress_percent" in payload
        ? { data: null, error: { code: "PGRST204", message: "Could not find the 'progress_percent' column of 'initiatives' in the schema cache" } }
        : { data: { id: "1" }, error: null }
    );
    const out = await writeAdaptive(attempt, { title: "T", start_date: "2026-01-01", progress_percent: null }, NEW);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt.mock.calls[1][0]).toEqual({ title: "T" });
    expect(out.result.data).toEqual({ id: "1" });
    expect(out.dropped).toEqual(["start_date", "progress_percent"]);
    expect(out.lost).toEqual(["start_date"]);
  });

  it("does not retry when the missing column is not a NEW one, or on other errors", async () => {
    const other = vi.fn(async () => ({
      data: null,
      error: { code: "PGRST204", message: "Could not find the 'titel' column of 'initiatives' in the schema cache" },
    }));
    expect((await writeAdaptive(other, { titel: "x", start_date: "2026-01-01" }, NEW)).result.error).not.toBeNull();
    expect(other).toHaveBeenCalledTimes(1);
    const rls = vi.fn(async () => ({ data: null, error: { code: "42501", message: "row-level security" } }));
    await writeAdaptive(rls, { start_date: "2026-01-01" }, NEW);
    expect(rls).toHaveBeenCalledTimes(1);
  });

  it("carriesData ignores null, blank, [] and {}", () => {
    expect([null, undefined, "", " ", [], {}].map(carriesData)).toEqual([false, false, false, false, false, false]);
    expect([0, false, "x", [1], { a: 1 }].map(carriesData)).toEqual([true, true, true, true, true]);
  });
});
