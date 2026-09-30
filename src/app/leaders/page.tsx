"use client";

import { useMemo, useState } from "react";
import { LeaderCard } from "@/components/cards/LeaderCard";
import { PageHero } from "@/components/layout/PageHero";
import { SectionIntro } from "@/components/layout/SectionIntro";
import { ClosingBand } from "@/components/layout/ClosingBand";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterBar } from "@/components/ui/FilterBar";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { COUNTIES } from "@/lib/constants";
import { useContent } from "@/components/content/ContentProvider";

export default function LeadersPage() {
  const { content, ready } = useContent();
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("all");
  const [office, setOffice] = useState("all");
  const [type, setType] = useState("all");

  const officeOptions = useMemo(() => {
    const set = new Set(content.leaders.map((l) => l.position));
    return Array.from(set);
  }, [content.leaders]);

  const filtered = useMemo(() => {
    return content.leaders.filter((l) => {
      const q = query.toLowerCase().trim();
      const matchesQuery =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.position.toLowerCase().includes(q) ||
        l.county.toLowerCase().includes(q) ||
        l.shortBio.toLowerCase().includes(q);
      const matchesCounty = county === "all" || l.county === county;
      const matchesOffice = office === "all" || l.position === office;
      const matchesType = type === "all" || l.type === type;
      return matchesQuery && matchesCounty && matchesOffice && matchesType;
    });
  }, [content.leaders, query, county, office, type]);

  if (!ready) return <LoadingState />;

  const leaders = content.leaders;
  const counties = new Set(leaders.map((l) => l.county)).size;
  const elected = leaders.filter((l) => l.type === "elected").length;
  const projects = new Set(leaders.flatMap((l) => l.projectIds)).size;

  return (
    <>
      <PageHero
        eyebrow="Know your leaders"
        titleText="See who leads. See what they deliver."
        title={
          <>
            See who leads.
            <br />
            <em className="script-accent text-accent">See what they deliver.</em>
          </>
        }
        description="Every leader here has a public profile that shows the projects they are running, how far each one has come, and the jobs and training those projects bring to the community. Find the leaders in your county, follow their work and hold them to their word."
        image="/home/hero-community.jpg"
        imageAlt="Illustrative view of leaders and residents walking through a public project"
        imagePosition="70% center"
        primary={{ label: "Find a leader", href: "#browse" }}
        secondary={{ label: "Are you a leader? Get started", href: "/signup" }}
        stats={[
          { value: leaders.length, label: "Leaders" },
          { value: counties, label: "Counties" },
          { value: elected, label: "Elected" },
          { value: projects, label: "Projects linked" },
        ]}
        stepsLabel="How to use this page"
        steps={[
          {
            title: "Find your leader",
            body: "Search by name, or filter by county, office or whether they are elected or aspiring.",
          },
          {
            title: "Check the work",
            body: "Open a profile to see their projects on the map, with real progress and milestones.",
          },
          {
            title: "Follow and speak up",
            body: "Get updates and share feedback on WhatsApp through M-Taji Faida.",
          },
        ]}
      />

      <section id="browse" className="scroll-mt-20 bg-bg py-18 md:py-22">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Leaders on M-Taji"
            title={
              <>
                Find a leader{" "}
                <em className="script-accent text-brand-green">near you.</em>
              </>
            }
            body="Elected leaders show what they have delivered. Aspirants show what they plan to build. Both put it in the open for you to see."
          />

          <div className="space-y-3">
            <SearchBar
              id="leader-search"
              label="Search"
              value={query}
              onChange={setQuery}
              placeholder="Search by name, office or county…"
            />
            <FilterBar
              filters={[
                {
                  id: "county",
                  label: "County",
                  value: county,
                  onChange: setCounty,
                  options: [
                    { value: "all", label: "All counties" },
                    ...COUNTIES.map((c) => ({ value: c, label: c })),
                  ],
                },
                {
                  id: "office",
                  label: "Office",
                  value: office,
                  onChange: setOffice,
                  options: [
                    { value: "all", label: "All offices" },
                    ...officeOptions.map((o) => ({ value: o, label: o })),
                  ],
                },
                {
                  id: "type",
                  label: "Elected or aspirant",
                  value: type,
                  onChange: setType,
                  options: [
                    { value: "all", label: "Everyone" },
                    { value: "elected", label: "Elected leaders" },
                    { value: "aspirant", label: "Aspirants" },
                  ],
                },
              ]}
            />
          </div>

          <p className="mt-6 text-caption font-bold text-ink" aria-live="polite">
            Showing {filtered.length} of {leaders.length} leaders
          </p>

          <div className="mt-4">
            {filtered.length === 0 ? (
              <EmptyState
                title="No leaders match"
                description="Try another county or office, or clear your search."
              />
            ) : (
              <CardCarousel key={filtered.map((l) => l.id).join("|")} label="Leaders">
                {filtered.map((leader) => (
                  <LeaderCard key={leader.id} leader={leader} />
                ))}
              </CardCarousel>
            )}
          </div>
        </div>
      </section>

      <ClosingBand
        eyebrow="For leaders and aspirants"
        title={
          <>
            Show the work.{" "}
            <em className="script-accent text-accent">Bring people along.</em>
          </>
        }
        body="Create your profile to put your projects on the map, share progress with the people you serve and reach them where they already are."
        actionLabel="Get started"
        href="/signup"
      />
    </>
  );
}
