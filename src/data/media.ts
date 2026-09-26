import type { MediaItem } from "@/types";

export const mediaItems: MediaItem[] = [
  {
    id: "med-001",
    slug: "thika-road-progress-march",
    title: "Feeder road base works advance through Thika estates",
    category: "project-updates",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80",
    date: "2026-03-02",
    excerpt:
      "Drainage channels and base layers are now visible across the first two priority segments, with satellite markers updated for public verification.",
    body: "Drainage channels and base layers are now visible across the first two priority segments, with satellite markers updated for public verification.\n\nWard teams coordinated with contractors to keep estate access open during grading. M-Taji Siasa publishes these updates so residents can verify progress against the GIS record.\n\nCommunity representatives will review surface dressing schedules at the next public walkthrough.",
    author: "M-Taji Siasa Editorial",
    updatedAt: "2026-03-05",
    relatedOpportunityIds: ["opp-001", "opp-002"],
    leaderId: "ldr-001",
    projectId: "prj-001",
  },
  {
    id: "med-002",
    slug: "community-walkthrough-thika",
    title: "Residents join a site walkthrough on Makongeni Avenue",
    category: "stories",
    type: "image",
    image:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&q=80",
    date: "2026-02-18",
    excerpt:
      "Community representatives reviewed drainage depths and upcoming surface dressing schedules with the ward office.",
    body: "Community representatives reviewed drainage depths and upcoming surface dressing schedules with the ward office.\n\nThe walkthrough followed published GIS markers for the Thika feeder road corridor, keeping expectations aligned with the live project record on M-Taji Siasa.",
    author: "Community desk",
    relatedOpportunityIds: ["opp-001", "opp-002"],
    leaderId: "ldr-001",
    projectId: "prj-001",
  },
  {
    id: "med-003",
    slug: "kisumu-maternity-wing",
    title: "Maternity wing roofing complete at Kisumu Central",
    category: "project-updates",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=80",
    date: "2026-01-24",
    excerpt:
      "Structural works have closed out; equipment installation is the next published milestone.",
    leaderId: "ldr-002",
    projectId: "prj-003",
  },
  {
    id: "med-004",
    slug: "fatuma-manifesto-release",
    title: "Aspirant releases open manifesto with mapped priorities",
    category: "leader-updates",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=1200&q=80",
    date: "2026-02-05",
    excerpt:
      "Conceptual visualisations are labelled as AI simulations — clearly separated from completed public works.",
    leaderId: "ldr-003",
  },
  {
    id: "med-005",
    slug: "eldoret-farmer-cohort",
    title: "First agribusiness cohort begins practical modules",
    category: "project-updates",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1200&q=80",
    date: "2026-01-12",
    excerpt:
      "Young farmers in Eldoret started demonstration-plot sessions under the county-linked training programme.",
    leaderId: "ldr-004",
    projectId: "prj-004",
  },
  {
    id: "med-006",
    slug: "makongeni-borehole-video",
    title: "Watch: borehole drilling day in Makongeni",
    category: "videos",
    type: "video",
    image:
      "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80",
    date: "2025-12-14",
    excerpt:
      "A short field capture from drilling day, published with GPS metadata for the project page.",
    body: "A short field capture from drilling day, published with GPS metadata for the project page.\n\nVideo and stills are timestamped so citizens can follow commissioning steps without confusing proposals for completed works.",
    author: "Field desk",
    relatedOpportunityIds: ["opp-005"],
    videoUrl: "https://example.com/video",
    leaderId: "ldr-001",
    projectId: "prj-002",
  },
  {
    id: "med-007",
    slug: "kisumu-market-handover",
    title: "Market shade works handed to trader committee",
    category: "news",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=1200&q=80",
    date: "2025-10-08",
    excerpt:
      "Completed shade and access improvements are now under local maintenance arrangements.",
    leaderId: "ldr-002",
    projectId: "prj-006",
  },
  {
    id: "med-008",
    slug: "coastal-drainage-vision",
    title: "What flood-ready corridors could look like",
    category: "stories",
    type: "image",
    image:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
    date: "2026-02-28",
    excerpt:
      "AI SIMULATION — conceptual visualisation of proposed drainage upgrades. Not a completed project.",
    leaderId: "ldr-003",
  },
  {
    id: "med-009",
    slug: "nairobi-safe-routes-brief",
    title: "Safe corridors brief shared with community partners",
    category: "leader-updates",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1200&q=80",
    date: "2026-03-08",
    excerpt:
      "An aspirant vision note outlining lighting and walkway priorities for Eastlands routes.",
    leaderId: "ldr-005",
  },
  {
    id: "med-010",
    slug: "mavoko-roads-complete",
    title: "Phase-one estate roads completed in Mavoko",
    category: "news",
    type: "article",
    image:
      "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=1200&q=80",
    date: "2025-07-20",
    excerpt:
      "Residents now have improved all-weather access on the first prioritised estate corridors.",
    leaderId: "ldr-006",
    projectId: "prj-008",
  },
];

export function getMediaByIds(ids: string[]) {
  return mediaItems.filter((m) => ids.includes(m.id));
}

export function getMediaBySlug(slug: string) {
  return mediaItems.find((m) => m.slug === slug);
}
