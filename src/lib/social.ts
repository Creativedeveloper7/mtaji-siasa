import type { SocialLinks } from "@/types";
import { safeHttpUrl } from "@/lib/safe-url";

/**
 * Social links as people type them: a full link, a link without "https://"
 * ("x.com/jane"), a handle ("@jane"), or for WhatsApp a phone number. Each is
 * turned into the network's own web address. Safe on server and client: the
 * profile form saves the result, and pages use it to show links that were
 * stored as handles.
 */

export type SocialKey = keyof SocialLinks;

export const SOCIAL_KEYS: SocialKey[] = ["x", "instagram", "facebook", "tiktok", "whatsapp", "website"];

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  website: "Website",
};

/** What the profile form suggests typing. */
export const SOCIAL_PLACEHOLDERS: Record<SocialKey, string> = {
  x: "@handle or x.com/handle",
  instagram: "@handle or instagram.com/handle",
  facebook: "facebook.com/page or page name",
  tiktok: "@handle or tiktok.com/@handle",
  whatsapp: "0712 345 678 or wa.me link",
  website: "example.co.ke",
};

/** Hosts each network's links live on (a pasted link without "https://" is matched against these). */
const HOSTS: Record<Exclude<SocialKey, "website">, RegExp> = {
  x: /^(?:www\.|mobile\.)?(?:x|twitter)\.com\//i,
  instagram: /^(?:www\.)?instagram\.com\//i,
  facebook: /^(?:www\.|m\.|web\.)?(?:facebook|fb)\.com\//i,
  tiktok: /^(?:www\.|vm\.)?tiktok\.com\//i,
  whatsapp: /^(?:wa\.me|(?:api\.|chat\.)?whatsapp\.com)\//i,
};

const HANDLES: Record<Exclude<SocialKey, "website" | "whatsapp">, { pattern: RegExp; url: (h: string) => string }> = {
  x: { pattern: /^[A-Za-z0-9_]{1,15}$/, url: (h) => `https://x.com/${h}` },
  instagram: { pattern: /^[A-Za-z0-9._]{1,30}$/, url: (h) => `https://www.instagram.com/${h}` },
  facebook: { pattern: /^[A-Za-z0-9.]{3,50}$/, url: (h) => `https://www.facebook.com/${h}` },
  tiktok: { pattern: /^[A-Za-z0-9._]{2,24}$/, url: (h) => `https://www.tiktok.com/@${h}` },
};

/** A Kenyan (or international, with +) phone number as wa.me digits. */
function whatsappDigits(value: string): string | undefined {
  const digits = value.replace(/[\s\-().]/g, "");
  if (/^\+?\d{9,15}$/.test(digits)) {
    const plain = digits.replace(/^\+/, "");
    if (/^0[17]\d{8}$/.test(plain)) return `254${plain.slice(1)}`;
    if (/^[17]\d{8}$/.test(plain)) return `254${plain}`;
    if (digits.startsWith("+") || /^254[17]\d{8}$/.test(plain)) return plain;
  }
  return undefined;
}

/**
 * The web address for what was typed, or undefined when it can't be read as
 * one. Full http(s) links are kept as typed (any site: people link to Linktree
 * and similar).
 */
export function socialHref(key: SocialKey, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const typed = value.trim();
  if (!typed) return undefined;
  const full = safeHttpUrl(typed);
  if (full) return full;
  if (/\s/.test(typed) && key !== "whatsapp") return undefined;

  if (key === "website") {
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(typed) ? safeHttpUrl(`https://${typed}`) : undefined;
  }
  if (HOSTS[key].test(typed)) return safeHttpUrl(`https://${typed}`);
  if (key === "whatsapp") {
    const digits = whatsappDigits(typed);
    return digits ? `https://wa.me/${digits}` : undefined;
  }
  const handle = typed.replace(/^@/, "");
  return HANDLES[key].pattern.test(handle) ? HANDLES[key].url(handle) : undefined;
}

/** A short label for a link: "@jane" for handle networks, the site name for a website. */
export function socialHandle(key: SocialKey, href: string): string | undefined {
  try {
    const url = new URL(href);
    const first = url.pathname.split("/").filter(Boolean)[0];
    if (key === "website") return url.hostname.replace(/^www\./, "");
    if (key === "whatsapp") return undefined;
    if (!first || (key === "facebook" && /\.php$/.test(first))) return undefined;
    return first.startsWith("@") ? first : `@${first}`;
  } catch {
    return undefined;
  }
}

/** Every readable link, in display order, with its address and label. */
export function socialEntries(links: SocialLinks | undefined): { key: SocialKey; href: string; label: string; handle?: string }[] {
  if (!links) return [];
  return SOCIAL_KEYS.flatMap((key) => {
    const href = socialHref(key, links[key]);
    return href ? [{ key, href, label: SOCIAL_LABELS[key], handle: socialHandle(key, href) }] : [];
  });
}
