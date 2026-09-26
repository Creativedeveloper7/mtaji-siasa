"use client";

import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminUI";
import { useContent } from "@/components/content/ContentProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/EmptyState";

export default function AdminOverviewPage() {
  const { content, ready, resetToSeed } = useContent();
  const { users } = useAuth();

  if (!ready) return <LoadingState label="Loading dashboard…" />;

  const cards = [
    { label: "Leaders", value: content.leaders.length, href: "/admin/leaders" },
    { label: "Projects", value: content.projects.length, href: "/admin/projects" },
    {
      label: "Opportunities",
      value: content.opportunities.length,
      href: "/admin/opportunities",
    },
    { label: "Media", value: content.media.length, href: "/admin/media" },
    { label: "Polls", value: content.polls.length, href: "/admin/polls" },
    { label: "Products", value: content.products.length, href: "/admin/products" },
    { label: "Users", value: users.length, href: "/admin/users" },
    {
      label: "Milestones",
      value: content.milestones.length,
      href: "/admin/projects",
    },
  ];

  return (
    <div>
      <AdminHeader
        title="Dashboard"
        description="Manage leaders, projects, opportunities, media and engagement across M-Taji Siasa."
        action={
          <Button type="button" variant="outline" onClick={resetToSeed}>
            Reset demo data
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
          >
            <p className="meta-label">{card.label}</p>
            <p className="mt-3 font-mono text-h1 text-accent">{card.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-border-accent bg-accent-soft p-6">
        <h2 className="text-h3 text-ink">Content → public site</h2>
        <p className="mt-2 max-w-2xl text-small text-ink-muted">
          Changes you save here update the live content store used by the public
          pages. Data is stored in this browser&apos;s local storage for the
          prototype.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button href="/leaders" variant="outline" size="sm">
            View leaders
          </Button>
          <Button href="/projects" variant="outline" size="sm">
            View projects
          </Button>
        </div>
      </div>
    </div>
  );
}
