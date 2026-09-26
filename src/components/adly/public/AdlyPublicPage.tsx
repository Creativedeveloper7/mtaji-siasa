"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  ArrowDown,
  BarChart3,
  Clapperboard,
  MapPinned,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AdlyInterestModal } from "./AdlyInterestModal";
import { AdlyAuthGateModal } from "./AdlyAuthGateModal";
import { cn } from "@/lib/utils";

const POSTER_GALLERY = [
  {
    label: "Campaign",
    src: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80",
  },
  {
    label: "Development",
    src: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80",
  },
  {
    label: "Social",
    src: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80",
  },
  {
    label: "Story",
    src: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80",
  },
];

const CAPABILITY_GRID = [
  {
    title: "AI development simulations",
    body: "Visualize proposed manifesto projects.",
    icon: Sparkles,
  },
  {
    title: "Project timelapses",
    body: "Show development over time using timestamped media.",
    icon: Clapperboard,
  },
  {
    title: "Campaign posters",
    body: "Create polished campaign and project creatives.",
    icon: Wand2,
  },
  {
    title: "Advertising intelligence",
    body: "Monitor and optimize campaign performance.",
    icon: Megaphone,
  },
  {
    title: "Policy review",
    body: "Identify potential platform-policy issues before publishing.",
    icon: ShieldCheck,
  },
  {
    title: "Campaign analytics",
    body: "Understand creative and campaign performance.",
    icon: BarChart3,
  },
  {
    title: "GIS + satellite storytelling",
    body: "Connect projects to real-world locations.",
    icon: MapPinned,
  },
  {
    title: "Creative workflows",
    body: "Move from idea → creative → campaign without leaving the ecosystem.",
    icon: Sparkles,
  },
];

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => setVisible(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -24px 0px" }
    );
    io.observe(el);
    // Fallback so content never stays invisible if IO doesn't fire
    const fallback = window.setTimeout(show, 1200);
    return () => {
      io.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function FlowColumn({ steps, title }: { steps: string[]; title: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <p className="meta-label text-accent">{title}</p>
      <ol className="mt-6 space-y-0">
        {steps.map((step, i) => (
          <li key={step} className="flex flex-col items-start">
            <span className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-small font-medium text-ink">
              {step}
            </span>
            {i < steps.length - 1 && (
              <ArrowDown
                className="my-2 ml-3 h-4 w-4 text-accent"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function HeroComposition() {
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-lg lg:aspect-square lg:max-w-none">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-bg-elevated via-surface to-bg opacity-80" />
      <div className="absolute inset-0 bg-grid-subtle opacity-40" />

      {/* Analytics card */}
      <div className="absolute right-2 top-4 z-20 w-[46%] animate-slide-up rounded-lg border border-border bg-bg-elevated/95 p-3 shadow-raised sm:right-4 sm:top-6 sm:p-4">
        <p className="meta-label">Campaign</p>
        <p className="mt-1 text-caption text-ink-muted">Reach · 7d</p>
        <p className="mt-2 font-mono text-h3 text-accent">248.4K</p>
        <div className="mt-3 flex h-10 items-end gap-1">
          {[40, 55, 48, 70, 62, 85, 78].map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-sm bg-accent/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Creative card */}
      <div
        className="absolute left-2 top-[18%] z-10 w-[52%] overflow-hidden rounded-lg border border-border bg-surface shadow-raised animate-slide-up sm:left-4"
        style={{ animationDelay: "120ms" }}
      >
        <div className="relative aspect-[4/5]">
          <Image
            src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=600&q=80"
            alt=""
            fill
            className="object-cover"
            sizes="240px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-caption font-medium text-ink">Poster draft</p>
            <p className="text-[10px] text-ink-subtle">Create with Adly</p>
          </div>
        </div>
      </div>

      {/* GIS / sim card */}
      <div
        className="absolute bottom-[22%] right-2 z-20 w-[48%] overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-raised animate-slide-up sm:bottom-[20%] sm:right-4"
        style={{ animationDelay: "200ms" }}
      >
        <div className="relative aspect-video">
          <Image
            src="https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80"
            alt=""
            fill
            className="object-cover opacity-80"
            sizes="220px"
          />
          <span className="absolute left-2 top-2 rounded bg-accent px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-ink-inverse">
            AI simulation
          </span>
        </div>
        <div className="border-t border-border px-3 py-2">
          <p className="text-caption text-ink">Proposed road corridor</p>
          <p className="text-[10px] text-ink-subtle">Proposed vision</p>
        </div>
      </div>

      {/* Timelapse strip */}
      <div
        className="absolute bottom-3 left-2 right-2 z-30 flex gap-2 rounded-lg border border-border bg-bg/90 p-2 backdrop-blur-md animate-slide-up sm:bottom-4 sm:left-4 sm:right-4"
        style={{ animationDelay: "280ms" }}
      >
        {["2024", "2025", "2026"].map((y, i) => (
          <div
            key={y}
            className={cn(
              "flex flex-1 flex-col items-center rounded-md px-1 py-2",
              i === 2 ? "bg-accent-soft" : "bg-surface"
            )}
          >
            <span className="font-mono text-[10px] text-accent">{y}</span>
            <span className="mt-1 text-[10px] text-ink-muted">
              {i === 0 ? "Before" : i === 1 ? "Works" : "After"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdlyPublicPage() {
  const [interestOpen, setInterestOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [simPhase, setSimPhase] = useState<"current" | "sim">("current");
  const [tlYear, setTlYear] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSimPhase((p) => (p === "current" ? "sim" : "current"));
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTlYear((y) => (y + 1) % 3);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  const handleGetStarted = useCallback(() => {
    setAuthOpen(true);
  }, []);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-grid-subtle opacity-40" />
        <div className="container-wide relative grid items-center gap-12 py-16 md:py-22 lg:grid-cols-2 lg:gap-16 lg:py-28">
          <div>
            <p className="meta-label text-accent">Powered by M-Taji</p>
            <h1 className="mt-4 text-display text-ink">
              Meet{" "}
              <span className="editorial-serif italic text-accent">Adly.</span>
            </h1>
            <p className="mt-5 max-w-xl text-body text-ink-muted">
              AI-powered campaign intelligence, creative production and
              development storytelling — built into M-Taji Siasa.
            </p>
            <p className="mt-3 max-w-xl text-small text-ink-subtle">
              From manifesto to simulation, project to timelapse, and campaign
              to measurable advertising — Adly helps turn ideas and development
              into stories people can see.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button type="button" size="lg" onClick={handleGetStarted}>
                Get Started
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => setInterestOpen(true)}
              >
                Show Interest
              </Button>
            </div>
          </div>
          <HeroComposition />
        </div>
      </section>

      {/* WHAT IS ADLY */}
      <section className="section-y border-b border-border">
        <div className="container-wide">
          <Reveal>
            <p className="meta-label text-accent">What is Adly?</p>
            <h2 className="mt-3 max-w-3xl text-h1 text-ink">
              One intelligence layer. Four powerful capabilities.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-ink-muted">
              Adly brings campaign creation, development storytelling and
              advertising intelligence into one connected system.
            </p>
          </Reveal>
        </div>
      </section>

      {/* CAP 01 — ADVERTISE */}
      <section className="section-y border-b border-border bg-bg-elevated">
        <div className="container-wide grid gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="meta-label text-accent">Capability 01</p>
            <h2 className="mt-3 text-h1 text-ink">Advertise smarter.</h2>
            <p className="mt-4 text-body text-ink-muted">
              Create, review, launch and monitor political and development
              campaigns across digital advertising platforms.
            </p>
            <p className="mt-4 text-small text-ink-muted">
              Adly helps review campaigns against configured platform
              requirements and identify potential policy issues before
              publishing.
            </p>
            <p className="mt-2 text-caption text-ink-subtle">
              Final advertising approval is determined by each advertising
              platform.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-small font-medium text-ink">
                  Corridor visibility · Active
                </p>
                <span className="rounded-md bg-success-muted px-2 py-1 text-caption text-success">
                  Policy clear
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Reach", "248.4K"],
                  ["Engagement", "18.2K"],
                  ["CTR", "2.4%"],
                  ["Spend", "KES 84K"],
                  ["Creative", "A / B"],
                  ["Review", "Passed"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-md border border-border bg-bg-elevated px-3 py-3"
                  >
                    <p className="meta-label">{label}</p>
                    <p className="mt-2 font-mono text-small text-accent">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CAP 02 — CREATE */}
      <section className="section-y border-b border-border">
        <div className="container-wide">
          <Reveal>
            <p className="meta-label text-accent">Capability 02</p>
            <h2 className="mt-3 text-h1 text-ink">
              Create campaign-ready visuals.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-ink-muted">
              Turn ideas, projects and political messaging into polished
              campaign posters and digital creatives.
            </p>
          </Reveal>
          <div className="mt-10 -mx-[var(--container-pad)] flex gap-4 overflow-x-auto px-[var(--container-pad)] pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
            {POSTER_GALLERY.map((item, i) => (
              <Reveal key={item.label} delay={i * 80} className="w-[70%] shrink-0 sm:w-[45%] md:w-auto">
                <figure className="overflow-hidden rounded-lg border border-border bg-surface">
                  <div className="relative aspect-[3/4]">
                    <Image
                      src={item.src}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width:768px) 70vw, 25vw"
                    />
                  </div>
                  <figcaption className="border-t border-border px-3 py-2.5 text-caption text-ink-muted">
                    {item.label} creative
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
          <div className="mt-8">
            <Button type="button" onClick={handleGetStarted}>
              Create with Adly
            </Button>
          </div>
        </div>
      </section>

      {/* CAP 03 — SHOW DEVELOPMENT */}
      <section className="section-y border-b border-border bg-bg-elevated">
        <div className="container-wide">
          <Reveal>
            <p className="meta-label text-accent">Capability 03</p>
            <h2 className="mt-3 text-h1 text-ink">Make development visible.</h2>
            <p className="mt-4 max-w-2xl text-body text-ink-muted">
              Turn timestamped project imagery, video and satellite data into
              compelling development stories.
            </p>
            <p className="mt-3 text-small font-medium text-accent">
              Development, documented over time.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-10 overflow-hidden rounded-xl border border-border bg-surface">
              <div className="grid border-b border-border sm:grid-cols-3">
                {["Before", "In progress", "After"].map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setTlYear(i)}
                    className={cn(
                      "px-4 py-3 text-left text-small transition-colors",
                      tlYear === i
                        ? "bg-accent-soft text-accent"
                        : "text-ink-muted hover:text-ink"
                    )}
                  >
                    <span className="font-mono text-caption text-accent">
                      202{4 + i}
                    </span>
                    <span className="mt-1 block font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <div className="relative aspect-[16/9]">
                <Image
                  src={
                    [
                      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
                      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
                      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
                    ][tlYear]
                  }
                  alt={`Project stage ${["before", "in progress", "after"][tlYear]}`}
                  fill
                  className="object-cover transition-opacity duration-500"
                  sizes="(max-width:1024px) 100vw, 1200px"
                />
                <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-2 bg-gradient-to-t from-bg/90 to-transparent p-4 pt-16">
                  {[
                    "Project timeline",
                    "Timestamped footage",
                    "Satellite imagery",
                    "GIS location",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-border bg-bg/80 px-2.5 py-1 text-caption text-ink-muted backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CAP 04 — SIMULATE */}
      <section className="section-y border-b border-border">
        <div className="container-wide grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Reveal>
            <p className="meta-label text-accent">Capability 04</p>
            <h2 className="mt-3 text-h1 text-ink">
              Turn manifestos into something people can see.
            </h2>
            <p className="mt-4 text-body text-ink-muted">
              Transform proposed development ideas into AI-powered visual
              simulations that help communicate what a future project could look
              like.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {[
                "Road",
                "Hospital",
                "Water",
                "Housing",
                "Market",
                "School",
                "Transit",
              ].map((t) => (
                <li
                  key={t}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-caption text-ink-muted"
                >
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex border-b border-border">
                <button
                  type="button"
                  onClick={() => setSimPhase("current")}
                  className={cn(
                    "flex-1 px-4 py-3 text-small",
                    simPhase === "current"
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted"
                  )}
                >
                  Current location
                </button>
                <button
                  type="button"
                  onClick={() => setSimPhase("sim")}
                  className={cn(
                    "flex-1 px-4 py-3 text-small",
                    simPhase === "sim"
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted"
                  )}
                >
                  AI simulation
                </button>
              </div>
              <div className="relative aspect-[16/10]">
                <Image
                  src={
                    simPhase === "current"
                      ? "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80"
                      : "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80"
                  }
                  alt={
                    simPhase === "current"
                      ? "Current site condition"
                      : "Proposed AI simulation of development"
                  }
                  fill
                  className="object-cover"
                  sizes="(max-width:1024px) 100vw, 50vw"
                />
                {simPhase === "sim" && (
                  <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                    <span className="rounded bg-accent px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-ink-inverse">
                      AI simulation
                    </span>
                    <span className="rounded border border-border bg-bg/85 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-ink backdrop-blur-sm">
                      Proposed vision
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* POWER OF ADLY */}
      <section className="section-y border-b border-border bg-bg-elevated">
        <div className="container-wide">
          <Reveal>
            <p className="meta-label text-accent">The power of Adly</p>
            <h2 className="mt-3 text-h1 text-ink">
              Adly is more than an AI tool.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-ink-muted">
              Adly connects the creative, development and advertising layers of
              M-Taji Siasa into one workflow.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Reveal delay={80}>
              <FlowColumn
                title="Manifesto path"
                steps={[
                  "Manifesto",
                  "AI simulation",
                  "Creative",
                  "Advertisement",
                  "Audience",
                  "Engagement",
                  "Measurement",
                ]}
              />
            </Reveal>
            <Reveal delay={160}>
              <FlowColumn
                title="Project path"
                steps={[
                  "Project",
                  "GIS",
                  "Timestamped media",
                  "Timelapse",
                  "Advertisement",
                  "Citizen engagement",
                ]}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* WHY POWERS M-TAJI */}
      <section className="section-y border-b border-border">
        <div className="container-wide">
          <Reveal>
            <p className="meta-label text-accent">Ecosystem</p>
            <h2 className="mt-3 text-h1 text-ink">
              Built to power M-Taji Siasa.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-ink-muted">
              M-Taji Siasa is the public-facing platform. Adly is the
              intelligence and creative layer behind it. Faida is the
              WhatsApp-powered engagement layer.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                {
                  name: "M-Taji Siasa",
                  role: "Discover",
                  body: "Leaders, projects, GIS evidence and public storytelling.",
                },
                {
                  name: "Adly",
                  role: "Create · Simulate · Advertise · Measure",
                  body: "Campaign intelligence and creative production.",
                },
                {
                  name: "Faida",
                  role: "Engage · Support · Connect",
                  body: "Conversational citizen engagement on WhatsApp.",
                },
              ].map((layer, i) => (
                <div
                  key={layer.name}
                  className={cn(
                    "rounded-xl border p-6",
                    i === 1
                      ? "border-accent/40 bg-accent-soft"
                      : "border-border bg-surface"
                  )}
                >
                  <p className="meta-label text-accent">{layer.role}</p>
                  <h3 className="mt-3 text-h3 text-ink">{layer.name}</h3>
                  <p className="mt-2 text-small text-ink-muted">{layer.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CAPABILITIES GRID */}
      <section className="section-y border-b border-border bg-bg-elevated">
        <div className="container-wide">
          <Reveal>
            <p className="meta-label text-accent">Adly capabilities</p>
            <h2 className="mt-3 text-h1 text-ink">Everything in one system.</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITY_GRID.map((item, i) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.title} delay={(i % 4) * 60}>
                  <article className="h-full rounded-lg border border-border bg-surface p-5">
                    <Icon className="h-5 w-5 text-accent" aria-hidden />
                    <h3 className="mt-4 text-small font-medium text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-caption text-ink-muted">
                      {item.body}
                    </p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-y">
        <div className="container-wide">
          <Reveal>
            <div className="rounded-xl border border-border-accent bg-accent-soft px-6 py-12 text-center md:px-12 md:py-16">
              <h2 className="text-h1 text-ink">Ready to put Adly to work?</h2>
              <p className="mx-auto mt-4 max-w-xl text-body text-ink-muted">
                Join the next generation of campaign and development storytelling
                with M-Taji.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" size="lg" onClick={handleGetStarted}>
                  Get Started
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => setInterestOpen(true)}
                >
                  Show Interest
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <AdlyInterestModal
        open={interestOpen}
        onClose={() => setInterestOpen(false)}
      />
      <AdlyAuthGateModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
