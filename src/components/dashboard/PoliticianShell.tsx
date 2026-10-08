"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Newspaper,
  Package,
  Sparkles,
  UserRound,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/EmptyState";

const baseLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/profile", label: "My profile", icon: UserRound },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/opportunities", label: "Opportunities", icon: Briefcase },
  { href: "/dashboard/media", label: "Media", icon: Newspaper },
  { href: "/dashboard/polls", label: "Polls", icon: Vote },
  { href: "/dashboard/merchandise", label: "Merchandise", icon: Package },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/adly/workspace", label: "Adly", icon: Megaphone },
];

export function PoliticianShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { leader, isAspirant, ready } = usePoliticianProfile();
  const [open, setOpen] = useState(false);

  const links = isAspirant
    ? [
        ...baseLinks.slice(0, 2),
        { href: "/dashboard/vision", label: "Vision", icon: Sparkles },
        ...baseLinks.slice(2),
      ]
    : baseLinks;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Politician">
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
    <RequireAuth roles={["leader", "aspirant", "citizen", "organization"]}>
      <div className="flex min-h-dvh bg-bg">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg-elevated lg:flex">
          <div className="border-b border-border px-4 py-4">
            <Logo />
            <p className="mt-2 text-caption text-ink-subtle">
              Politician workspace
            </p>
            {leader && (
              <p className="mt-1 truncate text-caption text-accent">
                {leader.honorific} {leader.name}
              </p>
            )}
          </div>
          {nav}
          <div className="space-y-2 border-t border-border p-3">
            {leader && (
              <Button
                href={`/leaders/${leader.slug}`}
                variant="ghost"
                size="sm"
                fullWidth
              >
                Public profile
              </Button>
            )}
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
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-md lg:h-16 lg:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-ink-muted"
                aria-label="Open menu"
                onClick={() => setOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="text-small font-medium text-ink">Dashboard</span>
            </div>
            <div className="hidden text-small text-ink-muted lg:block">
              {leader
                ? `${leader.honorific} ${leader.name} · ${leader.position}`
                : "Setting up your profile…"}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              {leader && (
                <Button
                  href={`/leaders/${leader.slug}`}
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  Public profile
                </Button>
              )}
            </div>
          </header>

          <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            {!ready || !leader ? (
              <LoadingState label="Preparing your workspace…" />
            ) : (
              children
            )}
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
            </aside>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
