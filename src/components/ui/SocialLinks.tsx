import {
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { SocialLinks as SocialLinksType } from "@/types";
import { cn } from "@/lib/utils";
import { socialEntries, type SocialKey } from "@/lib/social";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z" />
    </svg>
  );
}

const ICONS: Record<SocialKey, LucideIcon | typeof XIcon | typeof TikTokIcon> = {
  x: XIcon,
  instagram: Instagram,
  facebook: Facebook,
  tiktok: TikTokIcon,
  whatsapp: MessageCircle,
  website: Globe,
};

interface SocialLinksProps {
  links: SocialLinksType;
  className?: string;
  /**
   * "labelled" (default): buttons with the network and handle ("X @jane"),
   * easy to see. "icons": small square icons, for tight spaces.
   */
  variant?: "labelled" | "icons";
}

/**
 * A leader's social links. Whatever was saved (a full link, a handle such as
 * "@jane", a WhatsApp number) is shown as the network's web address
 * (socialHref); anything that can't be read as an http(s) link is left out,
 * so a stored "javascript:" value never becomes an href.
 */
export function SocialLinks({ links, className, variant = "labelled" }: SocialLinksProps) {
  const available = socialEntries(links);
  if (!available.length) return null;

  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Social links">
      {available.map(({ key, label, href, handle }) => {
        const Icon = ICONS[key];
        return (
          <li key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={handle ? `${label} ${handle}` : label}
              title={handle ? `${label} ${handle}` : label}
              className={cn(
                "flex items-center rounded-md border border-border bg-surface text-ink-muted transition-colors hover:border-border-strong hover:text-ink",
                variant === "icons" ? "h-10 w-10 justify-center" : "h-9 gap-2 px-3 text-caption font-medium"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {variant === "labelled" && (
                <span className="max-w-[14rem] truncate">
                  {label}
                  {handle && <span className="font-normal text-ink-subtle"> {handle}</span>}
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
