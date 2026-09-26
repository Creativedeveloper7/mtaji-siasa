import type { Poll } from "@/types";

export const polls: Poll[] = [
  {
    id: "pol-001",
    slug: "thika-next-priority",
    question: "Which development priority should Thika Town Ward emphasise next?",
    options: [
      { id: "o1", label: "Estate roads & drainage", votes: 428 },
      { id: "o2", label: "Water access points", votes: 356 },
      { id: "o3", label: "Youth skills programmes", votes: 291 },
      { id: "o4", label: "Market infrastructure", votes: 184 },
    ],
    closingDate: "2026-04-30",
    leaderId: "ldr-001",
    participationCount: 1259,
  },
  {
    id: "pol-002",
    slug: "project-update-frequency",
    question: "How often would you like project milestone updates?",
    options: [
      { id: "o1", label: "Weekly", votes: 512 },
      { id: "o2", label: "Bi-weekly", votes: 388 },
      { id: "o3", label: "Monthly", votes: 210 },
    ],
    closingDate: "2026-03-31",
    leaderId: "ldr-001",
    participationCount: 1110,
  },
  {
    id: "pol-003",
    slug: "kisumu-health-services",
    question: "Which health service improvement matters most to you?",
    options: [
      { id: "o1", label: "Maternity services", votes: 620 },
      { id: "o2", label: "Outpatient waiting times", votes: 440 },
      { id: "o3", label: "Pharmacy stock reliability", votes: 390 },
      { id: "o4", label: "Disability access", votes: 210 },
    ],
    closingDate: "2026-05-15",
    leaderId: "ldr-002",
    participationCount: 1660,
  },
  {
    id: "pol-004",
    slug: "mombasa-vision-priority",
    question: "Which aspirant priority resonates most for Mombasa?",
    options: [
      { id: "o1", label: "Flood resilience", votes: 710 },
      { id: "o2", label: "Public transport", votes: 520 },
      { id: "o3", label: "Youth enterprise", votes: 680 },
      { id: "o4", label: "Coastal livelihoods", votes: 430 },
    ],
    closingDate: "2026-06-01",
    leaderId: "ldr-003",
    participationCount: 2340,
  },
  {
    id: "pol-005",
    slug: "uasin-gishu-water",
    question: "Where should the next rural water extension focus?",
    options: [
      { id: "o1", label: "Northern settlements", votes: 280 },
      { id: "o2", label: "School clusters", votes: 310 },
      { id: "o3", label: "Market centres", votes: 195 },
    ],
    closingDate: "2026-04-12",
    leaderId: "ldr-004",
    participationCount: 785,
  },
  {
    id: "pol-006",
    slug: "nairobi-safety-routes",
    question: "Which safe-route improvement should come first?",
    options: [
      { id: "o1", label: "Street lighting", votes: 890 },
      { id: "o2", label: "Walkway repairs", votes: 640 },
      { id: "o3", label: "Community reporting points", votes: 410 },
    ],
    closingDate: "2026-05-01",
    leaderId: "ldr-005",
    participationCount: 1940,
  },
  {
    id: "pol-007",
    slug: "platform-engagement",
    question: "How do you prefer to receive development updates?",
    options: [
      { id: "o1", label: "WhatsApp via Faida", votes: 1204 },
      { id: "o2", label: "In-app notifications", votes: 560 },
      { id: "o3", label: "SMS", votes: 320 },
      { id: "o4", label: "Email digest", votes: 210 },
    ],
    closingDate: "2026-06-30",
    participationCount: 2294,
  },
];

export function getPollBySlug(slug: string) {
  return polls.find((p) => p.slug === slug);
}

export function getPollsByIds(ids: string[]) {
  return polls.filter((p) => ids.includes(p.id));
}
