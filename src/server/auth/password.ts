import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

let cachedDummyHash: string | undefined;

/** scrypt hash encoded as scrypt$N$r$p$salt$hash. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  const expected = Buffer.from(hashB64, "base64url");
  const salt = Buffer.from(saltB64, "base64url");
  const actual = scryptSync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: SCRYPT.maxmem,
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Used when the email is unknown so the compare still spends a hash check. */
export function dummyPasswordHash(): string {
  cachedDummyHash ??= hashPassword("not-a-real-password");
  return cachedDummyHash;
}
