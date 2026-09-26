"use client";

import { useMemo, useState } from "react";
import { LeaderCard } from "@/components/cards/LeaderCard";
import { PageHeader } from "@/components/project/ProjectHero";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterBar } from "@/components/ui/FilterBar";
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

  return (
    <>
      <PageHeader
        title="Leaders"
        description="Discover leaders, their work and the communities they serve."
      >
        <div className="space-y-4">
          <SearchBar
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
                label: "Type",
                value: type,
                onChange: setType,
                options: [
                  { value: "all", label: "All types" },
                  { value: "elected", label: "Elected" },
                  { value: "aspirant", label: "Aspirant" },
                ],
              },
            ]}
          />
        </div>
      </PageHeader>

      <section className="container-wide section-y-sm">
        {filtered.length === 0 ? (
          <EmptyState
            title="No leaders match"
            description="Try adjusting your search or filters."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((leader) => (
              <LeaderCard key={leader.id} leader={leader} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
