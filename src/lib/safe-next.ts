/** Origin used when there is no window (server render of a client component). */
const FALLBACK_ORIGIN = "http://localhost";

/**
 * A same-site path for a `next` redirect parameter, or "/" when it is missing
 * or points anywhere else. Resolves `next` against `origin` the way a browser
 * would (so `/\evil.com`, `//evil.com`, `https://evil.com` and `javascript:`
 * all leave the origin and are refused) and returns only path, query and hash.
 * Safe to import from both server and client code.
 */
export function safeNext(next: string | null | undefined, origin?: string): string {
  if (typeof next !== "string" || !next.trim()) return "/";
  const base = origin || (typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN);
  let target: URL;
  let home: URL;
  try {
    home = new URL(base);
    target = new URL(next, home);
  } catch {
    return "/";
  }
  if (target.origin !== home.origin) return "/";
  // "/.//evil.com" normalises to the path "//evil.com", which a browser would
  // read as a protocol-relative URL when navigated to.
  if (target.pathname.startsWith("//") || target.pathname.startsWith("/\\")) return "/";
  return `${target.pathname}${target.search}${target.hash}`;
}
