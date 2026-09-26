import type { Project, ProjectMilestone } from "@/types";

export const projects: Project[] = [
  {
    id: "prj-001",
    slug: "thika-feeder-road-rehab",
    name: "Thika Town Feeder Road Rehabilitation",
    category: "infrastructure",
    subcategory: "Road Rehabilitation",
    location: "Thika Town Ward, Kiambu County",
    county: "Kiambu",
    status: "in-progress",
    progress: 68,
    image:
      "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1400&q=80",
    description:
      "Phased rehabilitation of priority feeder roads connecting residential estates to the commercial spine of Thika Town. Works include grading, drainage improvement, base strengthening and surface dressing, with progress verified through site milestones and mapped locations.",
    startDate: "2025-03-12",
    expectedCompletion: "2026-08-30",
    leaderIds: ["ldr-001"],
    geo: {
      center: { lat: -1.0332, lng: 37.0693 },
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [37.062, -1.028],
            [37.076, -1.028],
            [37.078, -1.039],
            [37.061, -1.038],
            [37.062, -1.028],
          ],
        ],
      },
    },
    milestoneIds: ["ms-001", "ms-002", "ms-003", "ms-004", "ms-005"],
    opportunityIds: ["opp-001", "opp-002"],
    mediaIds: ["med-001", "med-002"],
  },
  {
    id: "prj-002",
    slug: "makongeni-water-supply",
    name: "Makongeni Community Water Supply",
    category: "infrastructure",
    subcategory: "Water Supply Project",
    location: "Makongeni, Kiambu County",
    county: "Kiambu",
    status: "in-progress",
    progress: 54,
    image:
      "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1400&q=80",
    description:
      "Borehole drilling, elevated storage and last-mile distribution points to improve reliable household water access in Makongeni. Citizens can view the installation footprint on satellite imagery and track commissioning milestones.",
    startDate: "2025-06-01",
    expectedCompletion: "2026-04-15",
    leaderIds: ["ldr-001"],
    geo: {
      center: { lat: -1.0485, lng: 37.0821 },
    },
    milestoneIds: ["ms-006", "ms-007", "ms-008", "ms-009", "ms-010"],
    opportunityIds: ["opp-005"],
    mediaIds: ["med-006"],
  },
  {
    id: "prj-003",
    slug: "kisumu-health-centre-upgrade",
    name: "Kisumu Central Health Centre Upgrade",
    category: "infrastructure",
    subcategory: "Health Centre Upgrade",
    location: "Kisumu Central, Kisumu County",
    county: "Kisumu",
    status: "in-progress",
    progress: 72,
    image:
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1400&q=80",
    description:
      "Expansion and equipment upgrade of a constituency health facility, including maternity wing refurbishment, waiting bay shade structures and improved access pathways.",
    startDate: "2024-11-20",
    expectedCompletion: "2026-06-30",
    leaderIds: ["ldr-002"],
    geo: {
      center: { lat: -0.0917, lng: 34.768 },
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [34.765, -0.089],
            [34.771, -0.089],
            [34.771, -0.094],
            [34.765, -0.094],
            [34.765, -0.089],
          ],
        ],
      },
    },
    milestoneIds: ["ms-011", "ms-012", "ms-013", "ms-014", "ms-015"],
    opportunityIds: ["opp-003"],
    mediaIds: ["med-003"],
  },
  {
    id: "prj-004",
    slug: "eldoret-agribusiness-training",
    name: "Eldoret Agribusiness Training Programme",
    category: "non-infrastructure",
    subcategory: "Youth Empowerment Programme",
    location: "Eldoret, Uasin Gishu County",
    county: "Uasin Gishu",
    status: "in-progress",
    progress: 41,
    image:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1400&q=80",
    description:
      "A skills and market-linkage programme for young farmers and agribusiness operators, combining practical training modules with supplier readiness coaching.",
    startDate: "2025-09-01",
    expectedCompletion: "2026-12-15",
    leaderIds: ["ldr-004"],
    geo: {
      center: { lat: 0.5143, lng: 35.2698 },
    },
    milestoneIds: ["ms-016", "ms-017", "ms-018", "ms-019", "ms-020"],
    opportunityIds: ["opp-007"],
    mediaIds: ["med-005"],
  },
  {
    id: "prj-005",
    slug: "thika-youth-skills-lab",
    name: "Thika Youth Skills Lab",
    category: "non-infrastructure",
    subcategory: "Youth Empowerment Programme",
    location: "Thika Town, Kiambu County",
    county: "Kiambu",
    status: "planned",
    progress: 18,
    image:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1400&q=80",
    description:
      "A ward-level skills lab preparing youth for construction trades, digital services and local contractor apprenticeships linked to ongoing public works.",
    startDate: "2026-01-15",
    expectedCompletion: "2026-11-30",
    leaderIds: ["ldr-001"],
    geo: {
      center: { lat: -1.0398, lng: 37.0745 },
    },
    milestoneIds: ["ms-021", "ms-022", "ms-023", "ms-024", "ms-025"],
    opportunityIds: ["opp-002"],
    mediaIds: [],
  },
  {
    id: "prj-006",
    slug: "kisumu-market-shade-works",
    name: "Kisumu Market Shade & Access Works",
    category: "infrastructure",
    subcategory: "Market Infrastructure",
    location: "Kisumu Central, Kisumu County",
    county: "Kisumu",
    status: "completed",
    progress: 100,
    image:
      "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=1400&q=80",
    description:
      "Installation of trader shade structures, improved drainage channels and paved pedestrian access within a busy urban market precinct.",
    startDate: "2024-05-10",
    expectedCompletion: "2025-10-01",
    leaderIds: ["ldr-002"],
    geo: {
      center: { lat: -0.1022, lng: 34.754 },
    },
    milestoneIds: ["ms-026", "ms-027", "ms-028", "ms-029", "ms-030"],
    opportunityIds: ["opp-006"],
    mediaIds: ["med-007"],
  },
  {
    id: "prj-007",
    slug: "moiben-rural-water-network",
    name: "Moiben Rural Water Network",
    category: "infrastructure",
    subcategory: "Water Supply Project",
    location: "Moiben, Uasin Gishu County",
    county: "Uasin Gishu",
    status: "in-progress",
    progress: 63,
    image:
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=1400&q=80",
    description:
      "Extension of a rural reticulation network with communal water points and metered kiosks serving clustered settlements around Moiben.",
    startDate: "2025-02-18",
    expectedCompletion: "2026-09-20",
    leaderIds: ["ldr-004"],
    geo: {
      center: { lat: 0.68, lng: 35.38 },
    },
    milestoneIds: ["ms-031", "ms-032", "ms-033", "ms-034", "ms-035"],
    opportunityIds: [],
    mediaIds: [],
  },
  {
    id: "prj-008",
    slug: "mavoko-estate-access-roads",
    name: "Mavoko Estate Access Roads — Phase One",
    category: "infrastructure",
    subcategory: "Road Rehabilitation",
    location: "Mavoko Ward, Machakos County",
    county: "Machakos",
    status: "completed",
    progress: 100,
    image:
      "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=1400&q=80",
    description:
      "Phase-one grading and gravel surfacing of priority estate access roads to improve all-weather connectivity for residents and service providers.",
    startDate: "2024-08-01",
    expectedCompletion: "2025-07-15",
    leaderIds: ["ldr-006"],
    geo: {
      center: { lat: -1.45, lng: 37.0 },
    },
    milestoneIds: ["ms-036", "ms-037", "ms-038", "ms-039", "ms-040"],
    opportunityIds: ["opp-009"],
    mediaIds: ["med-010"],
  },
];

function ms(
  id: string,
  projectId: string,
  number: number,
  date: string,
  title: string,
  description: string,
  status: ProjectMilestone["status"],
  image?: string
): ProjectMilestone {
  return { id, projectId, number, date, title, description, status, image };
}

export const milestones: ProjectMilestone[] = [
  ms("ms-001", "prj-001", 1, "2025-03-12", "Planning", "Route surveys, community feedback and design freeze completed.", "completed", "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80"),
  ms("ms-002", "prj-001", 2, "2025-05-02", "Funding", "Budget allocation confirmed and contractor mobilisation approved.", "completed"),
  ms("ms-003", "prj-001", 3, "2025-07-18", "Construction", "Drainage excavation and base works underway on priority segments.", "current", "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80"),
  ms("ms-004", "prj-001", 4, "2026-02-01", "Implementation", "Surface dressing and signage for completed segments.", "upcoming"),
  ms("ms-005", "prj-001", 5, "2026-08-30", "Completion", "Final inspection, handover and public walkthrough.", "upcoming"),

  ms("ms-006", "prj-002", 1, "2025-06-01", "Planning", "Hydrogeological survey and community siting workshops.", "completed"),
  ms("ms-007", "prj-002", 2, "2025-07-20", "Funding", "Capital and operations co-funding locked.", "completed"),
  ms("ms-008", "prj-002", 3, "2025-10-05", "Construction", "Borehole drilling and tank foundation works.", "current", "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&q=80"),
  ms("ms-009", "prj-002", 4, "2026-01-15", "Implementation", "Distribution lines and metered kiosks.", "upcoming"),
  ms("ms-010", "prj-002", 5, "2026-04-15", "Completion", "Commissioning and water quality certification.", "upcoming"),

  ms("ms-011", "prj-003", 1, "2024-11-20", "Planning", "Facility needs assessment with health workers and community reps.", "completed"),
  ms("ms-012", "prj-003", 2, "2025-01-10", "Funding", "Works package and equipment budget approved.", "completed"),
  ms("ms-013", "prj-003", 3, "2025-04-02", "Construction", "Maternity wing structural works and roofing.", "completed", "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80"),
  ms("ms-014", "prj-003", 4, "2025-11-01", "Implementation", "Equipment install and staff orientation.", "current"),
  ms("ms-015", "prj-003", 5, "2026-06-30", "Completion", "Official commissioning and service launch.", "upcoming"),

  ms("ms-016", "prj-004", 1, "2025-09-01", "Planning", "Curriculum design with agribusiness partners.", "completed"),
  ms("ms-017", "prj-004", 2, "2025-10-12", "Funding", "Programme sponsorship and venue partnerships secured.", "completed"),
  ms("ms-018", "prj-004", 3, "2025-12-01", "Construction", "Training cohort setup and demonstration plots.", "current"),
  ms("ms-019", "prj-004", 4, "2026-06-01", "Implementation", "Market linkage clinics and mentor matching.", "upcoming"),
  ms("ms-020", "prj-004", 5, "2026-12-15", "Completion", "Graduation showcase and impact review.", "upcoming"),

  ms("ms-021", "prj-005", 1, "2026-01-15", "Planning", "Skills demand mapping with local contractors.", "current"),
  ms("ms-022", "prj-005", 2, "2026-03-01", "Funding", "Equipment and facilitator budget approval.", "upcoming"),
  ms("ms-023", "prj-005", 3, "2026-05-01", "Construction", "Lab fit-out and workshop safety certification.", "upcoming"),
  ms("ms-024", "prj-005", 4, "2026-08-01", "Implementation", "First apprentice cohorts placed on live sites.", "upcoming"),
  ms("ms-025", "prj-005", 5, "2026-11-30", "Completion", "Cohort outcomes published for the ward.", "upcoming"),

  ms("ms-026", "prj-006", 1, "2024-05-10", "Planning", "Trader consultation and layout design.", "completed"),
  ms("ms-027", "prj-006", 2, "2024-06-20", "Funding", "Works package fully financed.", "completed"),
  ms("ms-028", "prj-006", 3, "2024-09-01", "Construction", "Shade frames, drainage and paving installed.", "completed"),
  ms("ms-029", "prj-006", 4, "2025-06-01", "Implementation", "Trader allocation and maintenance briefings.", "completed"),
  ms("ms-030", "prj-006", 5, "2025-10-01", "Completion", "Project handed over to market committee.", "completed"),

  ms("ms-031", "prj-007", 1, "2025-02-18", "Planning", "Route alignment and community water point siting.", "completed"),
  ms("ms-032", "prj-007", 2, "2025-04-01", "Funding", "Network extension financing confirmed.", "completed"),
  ms("ms-033", "prj-007", 3, "2025-07-15", "Construction", "Pipeline laying and tank installation.", "current"),
  ms("ms-034", "prj-007", 4, "2026-03-01", "Implementation", "Metered kiosk activation.", "upcoming"),
  ms("ms-035", "prj-007", 5, "2026-09-20", "Completion", "Network commissioning and operator handover.", "upcoming"),

  ms("ms-036", "prj-008", 1, "2024-08-01", "Planning", "Estate prioritisation with resident associations.", "completed"),
  ms("ms-037", "prj-008", 2, "2024-09-10", "Funding", "Phase-one works budget approved.", "completed"),
  ms("ms-038", "prj-008", 3, "2024-11-01", "Construction", "Grading and gravel surfacing completed.", "completed"),
  ms("ms-039", "prj-008", 4, "2025-04-01", "Implementation", "Drainage touch-ups and signage.", "completed"),
  ms("ms-040", "prj-008", 5, "2025-07-15", "Completion", "Phase-one handover to the ward office.", "completed"),
];

export function getProjectBySlug(slug: string) {
  return projects.find((p) => p.slug === slug);
}

export function getProjectsByIds(ids: string[]) {
  return projects.filter((p) => ids.includes(p.id));
}

export function getMilestonesByProject(projectId: string) {
  return milestones
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => a.number - b.number);
}
