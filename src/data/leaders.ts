import type { Leader } from "@/types";

export const leaders: Leader[] = [
  {
    id: "ldr-001",
    slug: "amara-njehia",
    name: "Amara Njehia",
    honorific: "Hon.",
    position: "Member of County Assembly — Thika Town Ward",
    type: "elected",
    county: "Kiambu",
    constituency: "Thika Town",
    ward: "Thika Town Ward",
    photo:
      "https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=800&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1600&q=80",
    shortBio:
      "Focused on water access, local roads and youth skills programmes across Thika Town.",
    bio: "Hon. Amara Njehia serves Thika Town Ward with a development agenda centred on visible public works, transparent project tracking and citizen participation. Her office publishes milestones, GIS locations and community opportunities for every active initiative.",
    achievements: [
      "Delivered phased rehabilitation of 4.2 km of feeder roads",
      "Commissioned a community borewell serving 1,800 households",
      "Launched a ward youth apprenticeship pipeline with local contractors",
    ],
    social: {
      x: "https://x.com",
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
      whatsapp: "https://wa.me/254711000001",
      website: "https://example.com",
    },
    projectIds: ["prj-001", "prj-002", "prj-005"],
    opportunityIds: ["opp-001", "opp-002", "opp-005"],
    mediaIds: ["med-001", "med-002", "med-006"],
    pollIds: ["pol-001", "pol-002"],
    productIds: ["prd-001", "prd-002", "prd-003"],
  },
  {
    id: "ldr-002",
    slug: "daniel-otieno",
    name: "Daniel Otieno",
    honorific: "Hon.",
    position: "Member of Parliament — Kisumu Central",
    type: "elected",
    county: "Kisumu",
    constituency: "Kisumu Central",
    photo:
      "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?w=800&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=1600&q=80",
    shortBio:
      "Championing lakeside infrastructure, health facilities and market modernisation.",
    bio: "Hon. Daniel Otieno represents Kisumu Central with an emphasis on evidence-based delivery. Constituents can follow project locations on satellite maps, review milestones and connect through Faida for volunteering and updates.",
    achievements: [
      "Advanced health centre upgrade to 72% completion",
      "Secured co-funding for dual-carriage feeder link",
      "Opened supplier onboarding windows for local SMEs",
    ],
    social: {
      x: "https://x.com",
      facebook: "https://facebook.com",
      tiktok: "https://tiktok.com",
      whatsapp: "https://wa.me/254711000002",
    },
    projectIds: ["prj-003", "prj-006"],
    opportunityIds: ["opp-003", "opp-006"],
    mediaIds: ["med-003", "med-007"],
    pollIds: ["pol-003"],
    productIds: ["prd-004"],
  },
  {
    id: "ldr-003",
    slug: "fatuma-hassan",
    name: "Fatuma Hassan",
    honorific: "H.E.",
    position: "County Governor Aspirant — Mombasa County",
    type: "aspirant",
    county: "Mombasa",
    photo:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=1600&q=80",
    shortBio:
      "Coastal development vision spanning drainage, youth enterprise and public transport.",
    bio: "H.E. Fatuma Hassan is an aspirant presenting a county development vision grounded in climate resilience, coastal livelihoods and transparent public investment. Proposed projects are clearly labelled as conceptual visualisations — not completed works.",
    achievements: [
      "Published a county-wide drainage priority map",
      "Convened youth enterprise roundtables in all six sub-counties",
      "Released an open manifesto with measurable outcome targets",
    ],
    social: {
      x: "https://x.com",
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
      website: "https://example.com",
    },
    projectIds: [],
    opportunityIds: ["opp-004"],
    mediaIds: ["med-004", "med-008"],
    pollIds: ["pol-004"],
    productIds: ["prd-005", "prd-006"],
    vision: {
      statement:
        "A Mombasa that moves goods and people efficiently, protects neighbourhoods from flooding, and creates dignified work for young people along the coast.",
      manifesto: [
        "Climate-ready drainage and flood corridors in high-risk wards",
        "Modernised neighbourhood markets with cold-chain access",
        "Youth skills academies linked to port and tourism value chains",
        "Transparent county project dashboards for every major works item",
      ],
      priorities: [
        "Flood resilience",
        "Public transport reliability",
        "Youth enterprise",
        "Coastal livelihoods",
        "Open government",
      ],
      proposedProjects: [
        {
          id: "prop-001",
          title: "Nyali Flood Corridor Upgrade",
          description:
            "A conceptual redesign of drainage channels and retention zones to reduce seasonal flooding in Nyali and adjacent estates.",
          location: "Nyali, Mombasa County",
          category: "infrastructure",
          simulationImage:
            "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
          expectedImpact:
            "Reduced flood downtime for households and small traders during long rains.",
        },
        {
          id: "prop-002",
          title: "Likoni Youth Enterprise Hub",
          description:
            "A proposed multi-use skills and incubation centre focused on marine services, digital trades and light manufacturing.",
          location: "Likoni, Mombasa County",
          category: "non-infrastructure",
          simulationImage:
            "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
          expectedImpact:
            "Structured pathways for 2,000 youth into apprenticeships and micro-enterprise support.",
        },
      ],
      expectedImpact: [
        "Fewer flood-related business interruptions",
        "Shorter average commute times on priority corridors",
        "Measurable growth in youth-led enterprises",
        "Public visibility of every major county project location",
      ],
    },
  },
  {
    id: "ldr-004",
    slug: "james-kiprop",
    name: "James Kiprop",
    honorific: "Hon.",
    position: "Senator — Uasin Gishu County",
    type: "elected",
    county: "Uasin Gishu",
    photo:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80",
    shortBio:
      "Advancing agribusiness corridors, rural water systems and school infrastructure.",
    bio: "Hon. James Kiprop works with county and national partners to make rural development visible — from borehole networks to classroom blocks — with satellite-verified locations and milestone reporting.",
    achievements: [
      "Supported completion of three school classroom blocks",
      "Expanded rural water reticulation to five settlements",
      "Opened agribusiness training opportunities for farmer groups",
    ],
    social: {
      x: "https://x.com",
      facebook: "https://facebook.com",
      whatsapp: "https://wa.me/254711000004",
    },
    projectIds: ["prj-004", "prj-007"],
    opportunityIds: ["opp-007"],
    mediaIds: ["med-005"],
    pollIds: ["pol-005"],
    productIds: [],
  },
  {
    id: "ldr-005",
    slug: "wanjiku-mwangi",
    name: "Wanjiku Mwangi",
    honorific: "Hon.",
    position: "Woman Representative Aspirant — Nairobi County",
    type: "aspirant",
    county: "Nairobi",
    photo:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1600&q=80",
    shortBio:
      "Platform centred on safe public spaces, women-led enterprise and urban services.",
    bio: "Hon. Wanjiku Mwangi is an aspirant articulating a Nairobi agenda around safety, economic inclusion and accountable urban development. Her vision pages clearly separate proposed concepts from delivered projects.",
    achievements: [
      "Published a ward-level safety audit summary",
      "Partnered with cooperatives on women supplier readiness",
      "Released an open volunteer engagement framework via Faida",
    ],
    social: {
      instagram: "https://instagram.com",
      x: "https://x.com",
      tiktok: "https://tiktok.com",
      website: "https://example.com",
    },
    projectIds: [],
    opportunityIds: ["opp-008"],
    mediaIds: ["med-009"],
    pollIds: ["pol-006"],
    productIds: ["prd-007"],
    vision: {
      statement:
        "A Nairobi where women and young people can move safely, earn steadily, and see public investment reflected in their neighbourhoods.",
      manifesto: [
        "Lighting and safe-route upgrades on priority pedestrian corridors",
        "Women supplier quotas on county-linked procurement windows",
        "Community childcare nodes near major markets",
        "Digital grievance and project visibility tools for every constituency",
      ],
      priorities: [
        "Public safety",
        "Women enterprise",
        "Urban services",
        "Youth opportunity",
      ],
      proposedProjects: [
        {
          id: "prop-003",
          title: "Eastlands Safe Corridors Network",
          description:
            "Conceptual lighting, walkway and community reporting nodes along high-footfall routes in Eastlands.",
          location: "Eastlands, Nairobi County",
          category: "infrastructure",
          simulationImage:
            "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1200&q=80",
          expectedImpact:
            "Improved perceived and measured safety for evening commuters and traders.",
        },
      ],
      expectedImpact: [
        "Safer evening mobility on priority routes",
        "Higher participation of women-owned firms in local supply chains",
        "Clearer citizen visibility into urban project progress",
      ],
    },
  },
  {
    id: "ldr-006",
    slug: "peter-mutiso",
    name: "Peter Mutiso",
    honorific: "Hon.",
    position: "Member of County Assembly — Mavoko Ward",
    type: "elected",
    county: "Machakos",
    constituency: "Mavoko",
    ward: "Mavoko Ward",
    photo:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=800&q=80",
    shortBio:
      "Driving estate roads, market stalls and water kiosks for rapidly growing settlements.",
    bio: "Hon. Peter Mutiso focuses on the practical infrastructure needs of fast-growing peri-urban communities — with GIS-backed project pages citizens can verify.",
    achievements: [
      "Completed phase one of estate access roads",
      "Delivered 12 metered water kiosks",
      "Opened a local supplier window for paving works",
    ],
    social: {
      facebook: "https://facebook.com",
      whatsapp: "https://wa.me/254711000006",
    },
    projectIds: ["prj-008"],
    opportunityIds: ["opp-009"],
    mediaIds: ["med-010"],
    pollIds: [],
    productIds: [],
  },
];

export function getLeaderBySlug(slug: string) {
  return leaders.find((l) => l.slug === slug);
}

export function getLeadersByCounty(county: string) {
  return leaders.filter((l) => l.county === county);
}
