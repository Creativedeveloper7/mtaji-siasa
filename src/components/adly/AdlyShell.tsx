"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  LayoutDashboard,
  Megaphone,
  Menu,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdlyProvider } from "@/components/adly/AdlyProvider";
import { AdlyAssistant } from "@/components/adly/AdlyUI";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

const WORKSPACE = "/adly/workspace";

const links = [
  { href: WORKSPACE, label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/adly/advertising", label: "Advertise", icon: Megaphone },
  { href: "/adly/poster", label: "Posters", icon: Wand2 },
  { href: "/adly/timelapse", label: "Timelapse", icon: Clapperboard },
  { href: "/adly/simulate", label: "Simulate", icon: Sparkles },
];

const ALLOWED = new Set(["leader", "aspirant", "admin"]);

function assistantContext(pathname: string) {
  if (pathname.startsWith("/adly/advertising")) return "advertising" as const;
  if (pathname.startsWith("/adly/poster")) return "poster" as const;
  if (pathname.startsWith("/adly/timelapse")) return "timelapse" as const;
  if (pathname.startsWith("/adly/simulate")) return "simulate" as const;
  return "home" as const;
}

function dashboardHome(role?: string) {
  if (role === "admin") return "/admin";
  if (role === "leader" || role === "aspirant") return "/dashboard";
  return "/";
}

function AdlyGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (ready) return;
    const id = window.setTimeout(() => setTimedOut(true), 2500);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (!ready && !timedOut) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6">
          <Logo />
          <ThemeToggle />
        </header>
        <LoadingState label="Opening Adly…" />
      </div>
    );
  }

  if (!user || !ALLOWED.has(user.role)) {
    const next = encodeURIComponent(pathname || WORKSPACE);
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button href={`/signin?next=${next}`} size="sm">
              Sign In
            </Button>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg text-center">
            <p className="meta-label text-accent">Adly</p>
            <h1 className="mt-3 text-h1 text-ink">
              Get started with{" "}
              <span className="editorial-serif italic text-accent">Adly</span>
            </h1>
            <p className="mt-4 text-body text-ink-muted">
              Create an M-Taji Siasa account or sign in to access the Adly
              workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button href={`/signin?next=${next}`}>Sign In</Button>
              <Button href={`/signup?next=${next}`} variant="outline">
                Sign Up
              </Button>
              <Button href="/adly" variant="ghost">
                Back to Adly
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdlyShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const home = dashboardHome(user?.role);
  const atOverview = pathname === WORKSPACE;
  const backHref = atOverview ? home : WORKSPACE;
  const backLabel = atOverview
    ? user?.role === "admin"
      ? "Back to admin"
      : "Back to dashboard"
    : "Back to overview";

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Adly">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-small transition-colors",
              active
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-surface hover:text-ink"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <AdlyGate>
      <AdlyProvider>
        <div className="flex min-h-dvh w-full bg-bg">
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg-elevated lg:flex">
            <div className="border-b border-border px-4 py-4">
              <Logo />
              <p className="mt-2 text-caption text-ink-subtle">Adly workspace</p>
              <p className="mt-1 text-caption text-accent">
                Create. Visualize. Advertise. Measure.
              </p>
            </div>
            {nav}
            <div className="space-y-2 border-t border-border p-3">
              <Button href={backHref} variant="outline" size="sm" fullWidth>
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Button>
              <Button href={home} variant="ghost" size="sm" fullWidth>
                Close Adly
              </Button>
              <Button href="/adly" variant="ghost" size="sm" fullWidth>
                Public Adly page
              </Button>
              <Button href="/" variant="ghost" size="sm" fullWidth>
                View site
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => signOut()}
              >
                Sign out
              </Button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-md lg:h-16 lg:px-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-ink-muted lg:hidden"
                  aria-label="Open menu"
                  onClick={() => setOpen(true)}
                >
                  <Menu className="h-4 w-4" />
                </button>
                <Button
                  href={backHref}
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {backLabel}
                </Button>
                <span className="text-small font-medium text-ink lg:hidden">
                  Adly
                </span>
                <div className="hidden text-small text-ink-muted lg:block">
                  AI campaign & development storytelling assistant
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
                <Button
                  href={home}
                  variant="outline"
                  size="sm"
                  aria-label="Close Adly"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Close</span>
                </Button>
              </div>
            </header>

            <div className="relative w-full min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
              <div className="mb-4 sm:hidden">
                <Button href={backHref} variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4" />
                  {backLabel}
                </Button>
              </div>
              <div className="w-full">{children}</div>
              <AdlyAssistant context={assistantContext(pathname)} />
            </div>
          </div>

          {open && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-bg/70"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-bg-elevated shadow-raised">
                <div className="flex items-center justify-between border-b border-border px-4 py-4">
                  <Logo />
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {nav}
                <div className="space-y-2 border-t border-border p-3">
                  <Button href={backHref} variant="outline" size="sm" fullWidth>
                    <ArrowLeft className="h-4 w-4" />
                    {backLabel}
                  </Button>
                  <Button href={home} variant="secondary" size="sm" fullWidth>
                    Close Adly
                  </Button>
                </div>
              </aside>
            </div>
          )}
        </div>
      </AdlyProvider>
    </AdlyGate>
  );
}
