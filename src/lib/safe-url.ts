/**
 * The value as an absolute http(s) URL, or undefined when it is anything else
 * (`javascript:`, `data:`, `mailto:`, protocol-relative `//host`, a bare
 * path or handle, not a string, empty).
 *
 * Returns the trimmed input unchanged, so stored links keep their spelling.
 * Values with whitespace or control characters inside are refused, so what is
 * checked here is exactly what a browser will parse from the href.
 * Safe to import from both server and client code.
 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  // Must name the scheme itself: "//evil.com" or "example.com" are not accepted.
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (!url.hostname) return undefined;
  return trimmed;
}
