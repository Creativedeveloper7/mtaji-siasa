import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const buttonClass =
  "inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-md bg-accent px-5 text-small font-bold text-[#211b12] transition-colors hover:bg-accent-hover md:self-auto";

export function ClosingBand({
  id,
  eyebrow,
  title,
  body,
  actionLabel,
  href,
  onAction,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  body: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
}) {
  const content = (
    <>
      {actionLabel}
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </>
  );

  return (
    <section id={id} className="band-dark py-18 md:py-20">
      <div className="container-wide flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow eyebrow-light">{eyebrow}</p>
          <h2 className="home-h2 mt-5 text-white">{title}</h2>
          <p className="mt-4 text-small leading-relaxed text-white/75 md:text-body">{body}</p>
        </div>
        {href ? (
          <Link href={href} className={buttonClass}>
            {content}
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={buttonClass}>
            {content}
          </button>
        )}
      </div>
    </section>
  );
}
