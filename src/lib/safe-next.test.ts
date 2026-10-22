import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

const ORIGIN = "https://siasa.example";

describe("safeNext", () => {
  it.each([
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["\\\\evil.com", "/"],
    ["https://evil.com", "/"],
    ["https://evil.com/dashboard", "/"],
    ["javascript:alert(1)", "/"],
    ["/.//evil.com", "/"],
    ["", "/"],
    [null, "/"],
  ])("refuses %j", (next, expected) => {
    expect(safeNext(next, ORIGIN)).toBe(expected);
  });

  it("keeps an encoded backslash as a same-site path", () => {
    // Stays on the site: the browser navigates to the path "/%5Cevil.com".
    expect(safeNext("/%5Cevil.com", ORIGIN)).toBe("/%5Cevil.com");
  });

  it("keeps path, query and hash of a same-site target", () => {
    expect(safeNext("/dashboard?x=1#y", ORIGIN)).toBe("/dashboard?x=1#y");
    expect(safeNext("https://siasa.example/adly?tab=2", ORIGIN)).toBe("/adly?tab=2");
  });
});
