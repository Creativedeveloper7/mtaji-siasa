"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Menu, Search, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/leaders", label: "Leaders" },
  { href: "/projects", label: "Projects" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/media", label: "Media" },
  { href: "/adly", label: "Adly" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, ready } = useAuth();
  const dashboard = user && user.role !== "admin" ? "/dashboard" : null;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const handleSignOut = () => {
    void signOut().then(() => router.push("/"));
  };

  const authDesktop = !ready ? null : user ? (
    <>
      {user.role === "admin" && (
        <Button href="/admin" variant="outline" size="sm">
          Admin
        </Button>
      )}
      {dashboard && (
        <Button href={dashboard} size="sm">
          Dashboard
        </Button>
      )}
      {(user.role === "leader" ||
        user.role === "aspirant" ||
        user.role === "admin") && (
        <Button href="/adly/workspace" variant="outline" size="sm">
          Adly
        </Button>
      )}
      <span className="hidden max-w-[140px] truncate text-small text-ink-muted xl:inline">
        {user.fullName}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
        Sign Out
      </Button>
    </>
  ) : (
    <>
      <Button href="/signin" variant="ghost" size="sm">
        Sign in
      </Button>
      <Button href="/signup" size="sm" className="font-bold">
        Get started
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Button>
    </>
  );

  const authMobile = !ready ? null : user ? (
    <>
      <p className="text-small text-ink">Signed in as {user.fullName}</p>
      {user.role === "admin" && (
        <Button href="/admin" variant="outline" fullWidth>
          Admin dashboard
        </Button>
      )}
      {dashboard && (
        <Button href={dashboard} fullWidth>
          Go to dashboard
        </Button>
      )}
      {(user.role === "leader" ||
        user.role === "aspirant" ||
        user.role === "admin") && (
        <Button href="/adly/workspace" variant="outline" fullWidth>
          Adly workspace
        </Button>
      )}
      <Button type="button" variant="secondary" fullWidth onClick={handleSignOut}>
        Sign Out
      </Button>
    </>
  ) : (
    <>
      <Button href="/signin" variant="secondary" fullWidth>
        Sign in
      </Button>
      <Button href="/signup" fullWidth className="font-bold">
        Get started
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Button>
    </>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-base",
        open
          ? "border-border bg-bg-elevated"
          : scrolled
            ? "border-border bg-bg/90 backdrop-blur-md"
            : "border-transparent bg-bg/70 backdrop-blur-sm"
      )}
    >
      <div className="container-wide flex h-[var(--nav-height)] items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "relative rounded-md px-3 py-2 text-small transition-colors duration-fast",
                isActive(link.href)
                  ? "text-ink"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              {link.label}
              {isActive(link.href) && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-green"
                />
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          {authDesktop}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          {dashboard && (
            <Button href={dashboard} size="sm">
              Dashboard
            </Button>
          )}
          {user?.role === "admin" && (
            <Button href="/admin" size="sm" variant="outline">
              Admin
            </Button>
          )}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-surface"
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-surface"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="border-t border-border bg-bg-elevated px-[var(--container-pad)] py-3 lg:hidden">
          <form action="/projects" method="get">
            <label className="sr-only" htmlFor="mobile-search">
              Search projects
            </label>
            <input
              id="mobile-search"
              name="q"
              type="search"
              placeholder="Search leaders, projects…"
              className="h-11 w-full rounded-md border border-border bg-surface px-4 text-small text-ink placeholder:text-ink-subtle focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              autoFocus
            />
          </form>
        </div>
      )}

      {open && (
        <div className="fixed inset-x-0 top-[var(--nav-height)] bottom-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-bg-elevated" aria-hidden />
          <nav
            className="mobile-nav-sheet relative flex h-full min-h-0 flex-col bg-bg-elevated px-[var(--container-pad)] pt-4"
            aria-label="Mobile"
          >
            <div className="mobile-nav-scroll min-h-0 flex-1 pb-4">
              <ul className="space-y-1 pb-2">
                {navLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className={cn(
                        "mobile-nav-link block rounded-md px-3 py-3 text-h3 hover:bg-surface focus-visible:bg-surface",
                        isActive(link.href)
                          ? "bg-accent-soft text-accent"
                          : "text-ink"
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/polls"
                    className={cn(
                      "mobile-nav-link block rounded-md px-3 py-3 text-h3 hover:bg-surface focus-visible:bg-surface",
                      isActive("/polls")
                        ? "bg-accent-soft text-accent"
                        : "text-ink"
                    )}
                  >
                    Polls
                  </Link>
                </li>
              </ul>
            </div>

            <div className="mobile-nav-footer space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2.5">
                <span className="text-small text-ink">Appearance</span>
                <ThemeToggle />
              </div>
              {authMobile}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
