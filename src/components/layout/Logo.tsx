import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  /** Mark size in pixels (default 32) */
  size?: number;
}

export function Logo({
  className,
  showWordmark = true,
  size = 32,
}: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="M-Taji Siasa home"
    >
      <span
        className="relative shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-border"
        style={{ width: size, height: size }}
      >
        <Image
          src="/mtaji-logo.png"
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          priority
        />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-small font-extrabold tracking-tight text-ink">
            M-TAJI <span className="text-brand-red">SIASA</span>
          </span>
          <span className="mt-0.5 hidden text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-subtle sm:block">
            Campaigns · Kazi · Community
          </span>
        </span>
      )}
    </Link>
  );
}
