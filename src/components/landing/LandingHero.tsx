"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";

function Typewriter({
  words,
  className,
  startDelay = 0,
}: {
  words: string[];
  className?: string;
  startDelay?: number;
}) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(words[0]);
  const [deleting, setDeleting] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => setStarted(true), 2200 + startDelay);
    return () => window.clearTimeout(t);
  }, [startDelay]);

  useEffect(() => {
    if (!started) return;
    const word = words[index];
    let delay = deleting ? 55 : 95;
    if (!deleting && text === word) delay = 1800;
    if (deleting && text === "") delay = 250;

    const t = window.setTimeout(() => {
      if (!deleting && text === word) {
        setDeleting(true);
      } else if (deleting && text === "") {
        setDeleting(false);
        setIndex((i) => (i + 1) % words.length);
      } else {
        const target = words[index];
        setText(deleting ? text.slice(0, -1) : target.slice(0, text.length + 1));
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [started, text, deleting, index, words]);

  return (
    <span className={cn("script-accent inline-flex items-baseline", className)}>
      {text}
      <span
        className="ml-0.5 inline-block h-[0.8em] w-[2px] translate-y-[0.08em] animate-pulse-soft bg-current"
        aria-hidden
      />
    </span>
  );
}

export function LandingHero() {
  const { user, ready } = useAuth();
  const workspace =
    ready && user?.role === "admin"
      ? { href: "/admin", label: "Go to admin" }
      : ready && user
        ? { href: "/dashboard", label: "Go to dashboard" }
        : null;

  return (
    <section
      className="relative isolate overflow-hidden bg-[#1d1914] text-white"
      aria-label="Show the work, projects and progress. Include citizens and youth in delivery."
    >
      <Image
        src="/home/hero-community.jpg"
        alt="Illustrative view of leaders, citizens and young people walking through a public road project"
        fill
        priority
        className="-z-20 object-cover object-[70%_center]"
        sizes="100vw"
      />
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(24,20,15,0.86)_0%,rgba(24,20,15,0.5)_52%,rgba(24,20,15,0.08)_100%)]"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-black/40 to-transparent lg:hidden"
        aria-hidden
      />

      <div className="container-wide flex min-h-[560px] flex-col justify-center py-20 md:min-h-[640px] lg:min-h-[700px]">
        <div className="max-w-2xl animate-slide-up">
          <p className="eyebrow text-white/85">
            Built for leaders. Rooted in community.
          </p>
          <h1 className="home-h1 mt-6 text-white">
            <span aria-hidden>
              Show the{" "}
              <Typewriter
                words={["work", "projects", "progress"]}
                className="text-accent"
              />
              <br />
              Include{" "}
              <Typewriter
                words={["citizens", "youth"]}
                className="text-brand-green"
                startDelay={900}
              />{" "}
              in delivery.
            </span>
            <span className="sr-only">
              Show the work, projects and progress. Include citizens and youth
              in delivery.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/85 md:text-base">
            M-Taji Siasa is an AI-powered digital media platform that enables
            leaders to showcase, communicate, and promote their development
            projects and vision through live GIS mapping, AI-powered
            simulations, and targeted social media advertising, while enabling
            young people to discover, track, and access opportunities within
            public projects.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={workspace?.href ?? "/signup"}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-small font-bold text-[#211b12] transition-colors hover:bg-accent-hover"
            >
              {workspace?.label ?? "Get started"}
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/projects"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-white/40 px-5 text-small font-bold text-white transition-colors hover:border-white hover:bg-white/10"
            >
              Explore projects
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      <p className="absolute bottom-4 right-[var(--container-pad)] text-[10px] text-white/70">
        Illustrative image · Not a photograph of a listed project
      </p>
    </section>
  );
}
