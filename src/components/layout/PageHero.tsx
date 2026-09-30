import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface PageHeroProps {
  eyebrow: string;
  /** Visible heading, usually with a script accent */
  title: ReactNode;
  /** Plain-text heading for assistive tech when `title` contains markup */
  titleText: string;
  description: string;
  image: string;
  imageAlt: string;
  imagePosition?: string;
  primary: HeroAction;
  secondary?: HeroAction;
  stats?: { value: string | number; label: string }[];
  steps?: { title: string; body: string }[];
  stepsLabel?: string;
}

const primaryClass =
  "inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-small font-bold text-[#211b12] transition-colors hover:bg-accent-hover";
const secondaryClass =
  "inline-flex h-11 items-center gap-2 rounded-md border border-white/40 px-5 text-small font-bold text-white transition-colors hover:border-white hover:bg-white/10";

function ActionButton({ action, className }: { action: HeroAction; className: string }) {
  const icon = action.href?.startsWith("#") ? (
    <ArrowDown className="h-4 w-4" aria-hidden />
  ) : (
    <ArrowUpRight className="h-4 w-4" aria-hidden />
  );
  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
      {icon}
    </button>
  );
}

const stepTones = ["border-t-accent", "border-t-brand-green", "border-t-brand-red"];

export function PageHero({
  eyebrow,
  title,
  titleText,
  description,
  image,
  imageAlt,
  imagePosition = "center",
  primary,
  secondary,
  stats,
  steps,
  stepsLabel = "How it works",
}: PageHeroProps) {
  return (
    <>
      <section
        className="relative isolate overflow-hidden bg-[#1d1914] text-white"
        aria-label={titleText}
      >
        <Image
          src={image}
          alt={imageAlt}
          fill
          priority
          className="-z-20 object-cover"
          style={{ objectPosition: imagePosition }}
          sizes="100vw"
        />
        <div
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(24,20,15,0.9)_0%,rgba(24,20,15,0.62)_55%,rgba(24,20,15,0.2)_100%)]"
          aria-hidden
        />

        <div className="container-wide flex min-h-[480px] flex-col justify-center py-16 md:min-h-[540px] md:py-20">
          <div className="max-w-2xl animate-slide-up">
            <p className="eyebrow text-white/85">{eyebrow}</p>
            <h1 className="home-h2 mt-5 text-white md:text-[3.25rem] md:leading-[1.08]">
              <span aria-hidden>{title}</span>
              <span className="sr-only">{titleText}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/85 md:text-base">
              {description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ActionButton action={primary} className={primaryClass} />
              {secondary && <ActionButton action={secondary} className={secondaryClass} />}
            </div>
          </div>

          {stats && stats.length > 0 && (
            <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 border-t border-white/20 pt-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col-reverse gap-1">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/65">
                    {s.label}
                  </dt>
                  <dd className="text-[1.75rem] font-extrabold leading-none text-white">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <p className="absolute bottom-4 right-[var(--container-pad)] hidden text-[10px] text-white/70 sm:block">
          Illustrative image
        </p>
      </section>

      {steps && steps.length > 0 && (
        <section className="bg-bg-soft py-10 md:py-12" aria-label={stepsLabel}>
          <div className="container-wide">
            <p className="eyebrow">{stepsLabel}</p>
            <ol className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className={cn(
                    "border border-border border-t-2 bg-surface p-5",
                    stepTones[i % stepTones.length]
                  )}
                >
                  <span className="text-caption font-bold tracking-[0.08em] text-ink-subtle">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-2 text-body font-extrabold text-ink">{step.title}</h2>
                  <p className="mt-1.5 text-small leading-relaxed text-ink-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}
