import {
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { SocialLinks as SocialLinksType } from "@/types";
import { cn } from "@/lib/utils";

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

const config: {
  key: keyof SocialLinksType;
  label: string;
  icon: LucideIcon | typeof XIcon | typeof TikTokIcon;
}[] = [
  { key: "x", label: "X", icon: XIcon },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: TikTokIcon },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "website", label: "Website", icon: Globe },
];

interface SocialLinksProps {
  links: SocialLinksType;
  className?: string;
}

export function SocialLinks({ links, className }: SocialLinksProps) {
  const available = config.filter((c) => links[c.key]);
  if (!available.length) return null;

  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {available.map(({ key, label, icon: Icon }) => (
        <li key={key}>
          <a
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            <Icon className="h-4 w-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
