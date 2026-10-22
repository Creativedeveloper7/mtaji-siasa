import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it("accepts absolute http and https URLs and returns them trimmed, unchanged", () => {
    expect(safeHttpUrl("https://x.com/example")).toBe("https://x.com/example");
    expect(safeHttpUrl("http://example.org")).toBe("http://example.org");
    expect(safeHttpUrl("  https://example.com/a?b=c#d  ")).toBe("https://example.com/a?b=c#d");
    expect(safeHttpUrl("HTTPS://Example.com/Path")).toBe("HTTPS://Example.com/Path");
    expect(safeHttpUrl("https://wa.me/254700000000")).toBe("https://wa.me/254700000000");
  });

  it("refuses script, data and other schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("JavaScript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl(" javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeUndefined();
    expect(safeHttpUrl("mailto:someone@example.com")).toBeUndefined();
    expect(safeHttpUrl("ftp://example.com/file")).toBeUndefined();
    expect(safeHttpUrl("file:///etc/passwd")).toBeUndefined();
  });

  it("refuses scheme tricks hidden by whitespace or control characters", () => {
    expect(safeHttpUrl("java\tscript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("java\nscript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("https://example.com/\u0000")).toBeUndefined();
    expect(safeHttpUrl("https://exa mple.com")).toBeUndefined();
  });

  it("refuses relative, protocol-relative and scheme-less values", () => {
    expect(safeHttpUrl("//evil.com")).toBeUndefined();
    expect(safeHttpUrl("/leaders/jane")).toBeUndefined();
    expect(safeHttpUrl("example.com")).toBeUndefined();
    expect(safeHttpUrl("@handle")).toBeUndefined();
    expect(safeHttpUrl("https:example.com")).toBeUndefined();
    expect(safeHttpUrl("https://")).toBeUndefined();
  });

  it("refuses empty and non-string values", () => {
    expect(safeHttpUrl("")).toBeUndefined();
    expect(safeHttpUrl("   ")).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(42)).toBeUndefined();
    expect(safeHttpUrl({ href: "https://example.com" })).toBeUndefined();
  });
});
