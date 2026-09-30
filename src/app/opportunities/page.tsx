"use client";

import { PageHero } from "@/components/layout/PageHero";
import { SectionIntro } from "@/components/layout/SectionIntro";
import { ClosingBand } from "@/components/layout/ClosingBand";
import { HomeOpportunities } from "@/components/landing/HomeOpportunities";
import { LoadingState } from "@/components/ui/EmptyState";
import { resolveOpportunityStatus } from "@/lib/related-content";
import { useContent } from "@/components/content/ContentProvider";
import { useFaida } from "@/components/faida/FaidaProvider";

export default function OpportunitiesPage() {
  const { content, ready } = useContent();
  const { openFaida } = useFaida();

  if (!ready) return <LoadingState />;

  const opportunities = content.opportunities;
  const open = opportunities.filter(
    (o) => resolveOpportunityStatus(o) !== "closed"
  ).length;
  const counties = new Set(opportunities.map((o) => o.county)).size;
  const kinds = new Set(opportunities.map((o) => o.category)).size;
  const linkedProjects = new Set(
    opportunities.flatMap((o) => (o.projectId ? [o.projectId] : []))
  ).size;

  return (
    <>
      <PageHero
        eyebrow="Kazi for the next generation"
        titleText="Find work, training and new Kazi."
        title={
          <>
            Find work, training
            <br />
            and <em className="script-accent text-brand-green">new Kazi.</em>
          </>
        }
        description="Public projects need people. Roads, clinics, water points and youth programmes create jobs, training places and supply contracts right where they are built. Every listing here tells you who can apply, where it is and when it closes, so you can decide quickly if it is for you."
        image="/home/opportunity-meeting.jpg"
        imageAlt="Illustrative community meeting where residents learn about local opportunities"
        primary={{ label: "Browse opportunities", href: "#browse" }}
        secondary={{
          label: "Get alerts on WhatsApp",
          onClick: () => openFaida("opportunity"),
        }}
        stats={[
          { value: open, label: "Open now" },
          { value: kinds, label: "Types of Kazi" },
          { value: counties, label: "Counties" },
          { value: linkedProjects, label: "Projects behind them" },
        ]}
        stepsLabel="How to use this page"
        steps={[
          {
            title: "Browse",
            body: "Search, or filter by type, location and who can apply.",
          },
          {
            title: "Check if it fits",
            body: "Each card shows eligibility and the deadline. Closing-soon listings are marked.",
          },
          {
            title: "Apply or save",
            body: "Open the listing to apply, or tap the bookmark to keep it for later.",
          },
        ]}
      />

      <section id="browse" className="scroll-mt-20 bg-bg py-18 md:py-22">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Open opportunities"
            title={
              <>
                Work that opens{" "}
                <em className="script-accent text-brand-red">doors.</em>
              </>
            }
            body="Jobs, tenders, training, funding and youth programmes linked to real projects in the community."
          />
          <HomeOpportunities items={opportunities} layout="grid" searchable />
        </div>
      </section>

      <ClosingBand
        eyebrow="M-Taji Faida"
        title={
          <>
            Never miss{" "}
            <em className="script-accent text-accent">new Kazi.</em>
          </>
        }
        body="Connect with M-Taji Faida and get new jobs, training and tenders in your area sent straight to WhatsApp."
        actionLabel="Get opportunity alerts"
        onAction={() => openFaida("opportunity")}
      />
    </>
  );
}
