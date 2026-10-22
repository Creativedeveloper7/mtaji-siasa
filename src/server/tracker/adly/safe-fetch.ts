/**
 * Fetch an image from a user-supplied public URL without letting the URL reach
 * the server's private network (SSRF).
 *
 *  - Only https. No redirects (a redirect could point anywhere).
 *  - The host is resolved once with dns.lookup({ all: true }); every address
 *    must be public (isPublicAddress). The connection is then pinned to the
 *    vetted address through the request's `lookup` option, so a second DNS
 *    answer (rebinding) cannot swap in a private address.
 *  - 10 s timeout, Content-Length checked up front, and the body is streamed
 *    with a running byte cap (aborted past the limit).
 *
 * isPublicAddress is pure and unit tested.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TIMEOUT_MS = 10_000;

export class UnsafeUrlError extends Error {}

// ---------------------------------------------------------------------------
// IP classifier

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** [network, prefix length] blocks that are not reachable public unicast. */
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function inV4Block(n: number, base: string, bits: number): boolean {
  const b = v4ToInt(base)!;
  const size = 2 ** (32 - bits);
  return n >= b && n < b + size;
}

function isPublicV4(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return false;
  return !V4_BLOCKED.some(([base, bits]) => inV4Block(n, base, bits));
}

/** Eight 16-bit groups, or null when the text is not an IPv6 address. */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // Trailing dotted IPv4 (::ffff:1.2.3.4, ::1.2.3.4, 64:ff9b::1.2.3.4)
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const n = v4ToInt(tail);
    if (n === null) return null;
    text = `${text.slice(0, lastColon + 1)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s ? s.split(":") : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const groups: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    groups.push(parseInt(g, 16));
  }
  return groups.length === 8 ? groups : null;
}

function embeddedV4(g: number[], from: number): string {
  return [g[from] >> 8, g[from] & 255, g[from + 1] >> 8, g[from + 1] & 255].join(".");
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // ::ffff:a.b.c.d (IPv4-mapped) and ::ffff:0:a.b.c.d (IPv4-translated): judge the IPv4 address.
  if (zeros(0, 5) && g[5] === 0xffff) return isPublicV4(embeddedV4(g, 6));
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return isPublicV4(embeddedV4(g, 6));
  // NAT64 (64:ff9b::/96): judge the IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPublicV4(embeddedV4(g, 6));
  // 6to4 (2002::/16): the IPv4 address sits in groups 1-2.
  if (g[0] === 0x2002) return isPublicV4(embeddedV4(g, 1));
  // Only global unicast 2000::/3 from here; that excludes ::, ::1, IPv4-compatible ::/96,
  // ULA fc00::/7 (incl. fd00:ec2::254 metadata), link-local fe80::/10, site-local fec0::/10,
  // multicast ff00::/8, discard 100::/64 and 64:ff9b:1::/48.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23 IETF special (Teredo, ORCHID, ...)
  if (g[0] === 0x3fff && g[1] < 0x1000) return false; // 3fff::/20 documentation
  return true;
}

/** True only for publicly routable unicast addresses (v4 or v6). Anything unparseable is not public. */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip.split("%")[0]);
  if (version === 4) return isPublicV4(ip);
  if (version === 6) return isPublicV6(ip);
  return false;
}

// ---------------------------------------------------------------------------
// fetch

type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const resolveAll: Resolver = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

/** Resolve a host and return one vetted address; throws when any answer is not public. */
export async function vetHost(hostname: string, resolve: Resolver = resolveAll): Promise<LookupAddress> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (!isPublicAddress(bare)) throw new UnsafeUrlError("The ad image host is not a public address.");
    return { address: bare, family: isIP(bare) };
  }
  let addresses: LookupAddress[];
  try {
    addresses = await resolve(bare);
  } catch {
    throw new UnsafeUrlError("The ad image host could not be found.");
  }
  if (!addresses.length) throw new UnsafeUrlError("The ad image host could not be found.");
  // Every answer must be public: an attacker controlling DNS could mix in a private one.
  if (addresses.some((a) => !isPublicAddress(a.address))) {
    throw new UnsafeUrlError("The ad image host is not a public address.");
  }
  return addresses[0];
}

export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * GET an https URL, pinned to a vetted public IP, with a timeout and a byte cap.
 * Rejects non-2xx answers and redirects.
 */
export async function fetchPublicImage(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number; resolve?: Resolver } = {}
): Promise<FetchedImage> {
  const maxBytes = options.maxBytes ?? IMAGE_MAX_BYTES;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("The ad image must be a public https URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new UnsafeUrlError("The ad image must be a public https URL.");
  }
  if (url.port && url.port !== "443") throw new UnsafeUrlError("The ad image must be a public https URL.");
  const pinned = await vetHost(url.hostname, options.resolve);
  const signal = AbortSignal.timeout(options.timeoutMs ?? IMAGE_TIMEOUT_MS);

  return new Promise<FetchedImage>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        signal,
        headers: { Accept: "image/*" },
        // Pin the connection to the address vetted above (no second DNS answer).
        lookup: ((
          _host: string,
          opts: { all?: boolean } | number | undefined,
          cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void
        ) => {
          if (typeof opts === "object" && opts?.all) cb(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        }) as never,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(status >= 300 && status < 400 ? "The ad image URL redirects." : `Could not download the ad image (${status}).`));
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          reject(new Error("The ad image is larger than 5 MB."));
          return;
        }
        const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy();
            req.destroy();
            reject(new Error("The ad image is larger than 5 MB."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (total > maxBytes) return;
          resolve({ bytes: new Uint8Array(Buffer.concat(chunks)), contentType });
        });
        res.on("error", reject);
      }
    );
    req.on("error", (error) => {
      reject(error.name === "AbortError" || error.name === "TimeoutError" ? new Error("The ad image took too long to download.") : error);
    });
    req.end();
  });
}
