"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LandingHero } from "@/components/landing/LandingHero";
import { HomeProducts } from "@/components/landing/HomeProducts";
import { HomeOpportunities } from "@/components/landing/HomeOpportunities";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { useContent } from "@/components/content/ContentProvider";
import { useFaida } from "@/components/faida/FaidaProvider";
import { LoadingState } from "@/components/ui/EmptyState";

const outlineButton =
  "inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-small font-bold text-ink transition-colors hover:border-accent/60 hover:text-accent";

const useCases = [
  {
    tag: "For elected leaders",
    title: <>Make delivery visible.</>,
    body: "Showcase the development you’ve delivered through live satellite imagery and AI progress videos voters can see and follow.",
    href: "/leaders",
    tone: "text-accent",
    bar: "border-t-accent",
  },
  {
    tag: "For aspirants",
    title: <>Make your vision real.</>,
    body: "Use AI to turn your ideas into clear project visualizations that voters can picture, appreciate and believe in.",
    href: "/adly",
    tone: "text-brand-green",
    bar: "border-t-brand-green",
  },
  {
    tag: "For citizens",
    title: (
      <>
        Explore opportunities.{" "}
        <em className="script-accent text-accent">Pata Kazi.</em>
      </>
    ),
    body: "Find training, jobs, tenders, partnerships, content creation and creative arts opportunities within public projects. Use AI to help you apply and gain access.",
    href: "/opportunities",
    tone: "text-brand-red",
    bar: "border-t-brand-red",
  },
];

function SectionIntro({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="home-h2 mt-5">{title}</h2>
        <p className="mt-4 text-small leading-relaxed text-ink-muted md:text-body">{body}</p>
      </div>
      {action}
    </div>
  );
}

export default function HomePage() {
  const { content, ready } = useContent();
  const { openFaida } = useFaida();

  if (!ready) return <LoadingState label="Loading platform…" />;

  const featuredProjects = content.projects.slice(0, 6);
  const featuredOpps = content.opportunities.slice(0, 6);

  return (
    <>
      <LandingHero />

      {/* Discovery layer */}
      <section id="platform" className="bg-bg py-18 md:py-22">
        <div className="container-wide grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="eyebrow">The visual discovery layer</p>
            <h2 className="home-h2 mt-5">
              Development you can{" "}
              <em className="script-accent text-accent">see and bet on.</em>
            </h2>
            <p className="mt-5 max-w-md text-small leading-relaxed text-ink-muted md:text-body">
              See who leads, what is being built, where it sits on the map, how
              far it has come, and how citizens can benefit.
            </p>
            <Link href="/projects" className={`${outlineButton} mt-7`}>
              Explore the map
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <figure className="relative overflow-hidden rounded-md shadow-[0_18px_48px_rgba(30,24,16,0.14)]">
            <div className="relative aspect-[3/2]">
              <Image
                src="/home/talanta-gis-map.jpg"
                alt="Illustrative GIS map of Talanta Stadium with project progress and action controls"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
              />
            </div>
            <span className="image-label absolute bottom-3 left-3">
              Illustrative GIS visual
            </span>
          </figure>
        </div>
      </section>

      {/* Three AI use cases */}
      <section id="ai-gis" className="bg-bg pb-20 pt-10 md:pb-24">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Built around the people public development serves"
            title={
              <>
                One platform.
                <br />
                <em className="script-accent text-brand-green">Three AI use cases.</em>
              </>
            }
            body="Campaign, visualize and discover in one place — whether you’re delivering the work, contesting a seat or looking for your next opportunity."
          />
          <CardCarousel label="AI use cases">
            {useCases.map((card) => (
              <article
                key={card.tag}
                className={`flex h-full flex-col rounded-md border border-border border-t-2 bg-surface p-6 ${card.bar}`}
              >
                <p className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${card.tone}`}>
                  {card.tag}
                </p>
                <h3 className="mt-3 text-[1.35rem] font-extrabold leading-snug tracking-[-0.01em] text-ink">
                  {card.title}
                </h3>
                <p className="mt-3 text-small leading-relaxed text-ink-muted">{card.body}</p>
                <Link
                  href={card.href}
                  className="mt-auto inline-flex items-center gap-2 self-start pt-8 text-small font-bold text-ink transition-colors hover:text-accent"
                >
                  Explore
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            ))}
          </CardCarousel>
        </div>
      </section>

      {/* Toolkit */}
      <section className="bg-bg pb-22 pt-4">
        <div className="container-wide">
          <SectionIntro
            eyebrow="The M-Taji toolkit"
            title={
              <>
                Three products.
                <br />
                <em className="script-accent text-accent">One public story.</em>
              </>
            }
            body="Track the work, communicate progress and keep the community engaged."
          />
          <HomeProducts />
        </div>
      </section>

      {/* Projects */}
      <section className="bg-bg-soft py-22">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Proof on the ground"
            title={
              <>
                Don’t just say it.{" "}
                <em className="script-accent text-accent">Show it.</em>
              </>
            }
            body="Leaders can showcase development work while communities follow its location, progress and milestones."
            action={
              <Link href="/projects" className={`${outlineButton} self-start md:self-auto`}>
                View all projects
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <CardCarousel label="Development projects" desktop="carousel">
            {featuredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </CardCarousel>
        </div>
      </section>

      {/* Opportunities */}
      <section className="bg-bg py-22">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Kazi for the next generation"
            title={
              <>
                Every project.{" "}
                <em className="script-accent text-brand-green">New Kazi.</em>
              </>
            }
            body="Bring youth opportunities together around the projects creating them — from training and tenders to local supply."
            action={
              <Link href="/opportunities" className={`${outlineButton} self-start md:self-auto`}>
                All opportunities
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <HomeOpportunities items={featuredOpps} />
        </div>
      </section>

      {/* Faida closing band */}
      <section id="faida" className="band-dark py-18 md:py-20">
        <div className="container-wide flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow eyebrow-light">M-Taji Faida</p>
            <h2 className="home-h2 mt-5 text-white">
              Keep citizens <em className="script-accent text-accent">connected.</em>
            </h2>
            <p className="mt-4 text-small leading-relaxed text-white/75 md:text-body">
              Keep citizens connected to opportunities, updates, questions and
              community feedback through M-Taji Faida’s WhatsApp-powered
              engagement agent.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openFaida("connect")}
            className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-md bg-accent px-5 text-small font-bold text-[#211b12] transition-colors hover:bg-accent-hover md:self-auto"
          >
            Connect with Faida
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </section>
    </>
  );
}
