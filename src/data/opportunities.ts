import type { Opportunity } from "@/types";

export const opportunities: Opportunity[] = [
  {
    id: "opp-001",
    slug: "thika-local-supplier",
    title: "Local Supplier Opportunity — Aggregates & Culverts",
    category: "business",
    location: "Thika Town, Kiambu County",
    county: "Kiambu",
    deadline: "2027-04-30",
    eligibility: "Open to registered local suppliers with relevant construction experience.",
    image: "/home/opportunity-meeting.jpg",
    description:
      "Supply window for aggregates, culvert sections and related materials supporting feeder road rehabilitation works in Thika Town Ward.",
    organization: "Thika Town Ward Works Coordination",
    relatedMediaIds: ["med-001", "med-002"],
    projectId: "prj-001",
    leaderId: "ldr-001",
  },
  {
    id: "opp-002",
    slug: "thika-youth-apprenticeship",
    title: "Youth Training Programme — Site Trades",
    category: "youth",
    location: "Thika Town, Kiambu County",
    county: "Kiambu",
    deadline: "2027-05-15",
    eligibility: "Open to young residents aged 18–35 living in Thika Town.",
    image: "/home/project-road.jpg",
    description:
      "Apprenticeship placements in grading, drainage and finishing trades linked to active public works sites.",
    projectId: "prj-001",
    leaderId: "ldr-001",
  },
  {
    id: "opp-003",
    slug: "kisumu-construction-tender",
    title: "Construction Tender — Health Centre Finishes",
    category: "tenders",
    location: "Kisumu Central, Kisumu County",
    county: "Kisumu",
    deadline: "2027-03-28",
    eligibility: "Open to qualified contractors with valid registration and compliance documents.",
    image: "/home/project-health.jpg",
    description:
      "Open tender for finishing works including flooring, joinery and painting for the maternity wing upgrade.",
    projectId: "prj-003",
    leaderId: "ldr-002",
  },
  {
    id: "opp-004",
    slug: "mombasa-drainage-consultant",
    title: "Technical Consulting — Flood Corridor Study",
    category: "jobs",
    location: "Mombasa County",
    county: "Mombasa",
    deadline: "2027-04-10",
    eligibility: "Qualified civil / environmental engineers with coastal drainage experience.",
    description:
      "Short-term consulting assignment to support conceptual flood corridor planning under an aspirant development vision. This is not a completed public works contract.",
    leaderId: "ldr-003",
  },
  {
    id: "opp-005",
    slug: "makongeni-water-operators",
    title: "Community Water Point Operators",
    category: "jobs",
    location: "Makongeni, Kiambu County",
    county: "Kiambu",
    deadline: "2027-06-01",
    eligibility: "Residents of Makongeni with basic numeracy and community referral.",
    description:
      "Part-time operator roles for metered community water kiosks once commissioning begins.",
    organization: "Makongeni Community Water Committee",
    relatedMediaIds: ["med-006"],
    projectId: "prj-002",
    leaderId: "ldr-001",
  },
  {
    id: "opp-006",
    slug: "kisumu-market-vendor-support",
    title: "Market Vendor Business Coaching",
    category: "training",
    location: "Kisumu Central, Kisumu County",
    county: "Kisumu",
    deadline: "2027-05-20",
    eligibility: "Registered traders operating within the upgraded market precinct.",
    description:
      "Short coaching modules on record-keeping, collective purchasing and customer service for market traders.",
    projectId: "prj-006",
    leaderId: "ldr-002",
  },
  {
    id: "opp-007",
    slug: "eldoret-agri-funding",
    title: "Seed Funding Window — Youth Agribusiness",
    category: "funding",
    location: "Eldoret, Uasin Gishu County",
    county: "Uasin Gishu",
    deadline: "2027-07-31",
    eligibility: "Programme graduates with a viable agribusiness plan and local guarantor.",
    description:
      "Catalytic seed funding for graduates of the Eldoret agribusiness training programme.",
    projectId: "prj-004",
    leaderId: "ldr-004",
  },
  {
    id: "opp-008",
    slug: "nairobi-women-supplier-readiness",
    title: "Women Supplier Readiness Clinics",
    category: "training",
    location: "Nairobi County",
    county: "Nairobi",
    deadline: "2027-04-22",
    eligibility: "Women-owned micro and small enterprises registered in Nairobi.",
    description:
      "Clinics covering compliance documents, pricing and bid readiness for public-linked supply opportunities.",
    leaderId: "ldr-005",
  },
  {
    id: "opp-009",
    slug: "mavoko-paving-suppliers",
    title: "Local Supplier Opportunity — Paving Materials",
    category: "business",
    location: "Mavoko, Machakos County",
    county: "Machakos",
    deadline: "2027-03-15",
    eligibility: "Machakos-based suppliers with delivery capacity to Mavoko estates.",
    description:
      "Supply of paving materials and related inputs for subsequent estate road phases.",
    projectId: "prj-008",
    leaderId: "ldr-006",
  },
  {
    id: "opp-010",
    slug: "coastal-youth-digital-jobs",
    title: "Coastal Youth Digital Skills Intake",
    category: "youth",
    location: "Mombasa County",
    county: "Mombasa",
    deadline: "2027-05-05",
    eligibility: "Youth aged 18–30 from Mombasa County with secondary education.",
    description:
      "Intake for digital customer support and content roles linked to civic engagement programmes.",
    leaderId: "ldr-003",
  },
];

export function getOpportunityBySlug(slug: string) {
  return opportunities.find((o) => o.slug === slug);
}

export function getOpportunitiesByIds(ids: string[]) {
  return opportunities.filter((o) => ids.includes(o.id));
}
