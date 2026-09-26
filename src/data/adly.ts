import type {
  AdCreative,
  AdlyContent,
  AdlyInsight,
  AdPlatform,
  AdPlatformId,
  Campaign,
  PolicyReview,
  Poster,
  Simulation,
  Timelapse,
} from "@/types/adly";

export const AD_PLATFORMS: AdPlatform[] = [
  {
    id: "google",
    name: "Google Ads",
    description: "Search, Display & YouTube",
    available: true,
  },
  {
    id: "x",
    name: "X",
    description: "Promoted posts & trends",
    available: true,
  },
  {
    id: "meta",
    name: "Meta",
    description: "Ads across Instagram, Facebook & WhatsApp",
    available: false,
    family: "meta",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Feed, Stories & Reels via Meta",
    available: false,
    family: "meta",
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Feed & video placements via Meta",
    available: false,
    family: "meta",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Click-to-WhatsApp & status via Meta",
    available: false,
    family: "meta",
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "In-feed & spark ads",
    available: false,
  },
];

export const ACTIVE_AD_PLATFORM_IDS = AD_PLATFORMS.filter((p) => p.available).map(
  (p) => p.id
);

export function isAdPlatformAvailable(id: AdPlatformId) {
  return AD_PLATFORMS.some((p) => p.id === id && p.available);
}

export function getAdPlatformName(id: AdPlatformId) {
  return AD_PLATFORMS.find((p) => p.id === id)?.name || id;
}

export const CAMPAIGN_OBJECTIVES = [
  { id: "awareness", label: "Awareness" },
  { id: "reach", label: "Reach" },
  { id: "engagement", label: "Engagement" },
  { id: "traffic", label: "Traffic" },
  { id: "leads", label: "Leads" },
  { id: "community-support", label: "Community Support" },
  { id: "project-visibility", label: "Project Visibility" },
] as const;

export const POSTER_TYPES = [
  { id: "campaign", label: "Campaign" },
  { id: "development-project", label: "Development Project" },
  { id: "event", label: "Event" },
  { id: "community-message", label: "Community Message" },
  { id: "manifesto", label: "Manifesto" },
  { id: "announcement", label: "Announcement" },
  { id: "achievement", label: "Achievement" },
] as const;

export const DEVELOPMENT_TYPES = [
  { id: "hospital", label: "New hospital" },
  { id: "road", label: "Road expansion" },
  { id: "housing", label: "Affordable housing" },
  { id: "water", label: "Water infrastructure" },
  { id: "market", label: "Market redevelopment" },
  { id: "sports", label: "Sports facility" },
  { id: "industrial", label: "Industrial park" },
  { id: "transport", label: "Public transport" },
  { id: "school", label: "School" },
  { id: "other", label: "Other" },
] as const;

const POLICY_DISCLAIMER =
  "Adly checks your campaign against configured platform requirements. Final approval is determined by the advertising platform.";

const creatives: AdCreative[] = [
  {
    id: "cr-001",
    name: "Water project — progress",
    headline: "Clean water is arriving in Kikuyu",
    body: "Track the Makongeni water supply with live GIS evidence on M-Taji Siasa.",
    cta: "See the project",
    image:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
    platformIds: ["google", "x"],
    performance: {
      spend: 42000,
      reach: 186000,
      impressions: 412000,
      engagement: 18400,
      ctr: 2.4,
      conversions: 920,
      currency: "KES",
    },
  },
  {
    id: "cr-002",
    name: "Road rehab — awareness",
    headline: "Thika feeder roads, mapped and measurable",
    body: "Follow milestones, media and opportunities linked to this corridor.",
    cta: "Explore progress",
    image:
      "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80",
    platformIds: ["google"],
    performance: {
      spend: 28000,
      reach: 98000,
      impressions: 210000,
      engagement: 6200,
      ctr: 1.1,
      conversions: 310,
      currency: "KES",
    },
  },
  {
    id: "cr-003",
    name: "Vision — proposed clinic",
    headline: "A proposed community clinic — AI simulation",
    body: "Conceptual visualisation of a manifesto idea. Not a completed project.",
    cta: "View vision",
    image:
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=80",
    platformIds: ["x"],
    performance: {
      spend: 15000,
      reach: 72000,
      impressions: 155000,
      engagement: 9100,
      ctr: 3.1,
      conversions: 480,
      currency: "KES",
    },
  },
];

const policyReviews: PolicyReview[] = [
  {
    id: "prv-001",
    campaignId: "cmp-001",
    status: "passed",
    disclaimer: POLICY_DISCLAIMER,
    reviewedAt: "2026-09-20T10:00:00.000Z",
    checks: [
      {
        id: "pc-1",
        label: "Political advertising disclosure",
        status: "passed",
        note: "Appears aligned with selected platform disclosure fields.",
      },
      {
        id: "pc-2",
        label: "Restricted content",
        status: "passed",
        note: "No restricted categories detected in copy or creative.",
      },
      {
        id: "pc-3",
        label: "Unsupported claims",
        status: "passed",
        note: "Claims reference measurable project status language.",
      },
      {
        id: "pc-4",
        label: "Image / text concerns",
        status: "passed",
        note: "No overlay-ratio issues flagged in this review.",
      },
      {
        id: "pc-5",
        label: "Targeting concerns",
        status: "passed",
        note: "Geographic targeting only — no prohibited categories.",
      },
      {
        id: "pc-6",
        label: "Landing page concerns",
        status: "review",
        note: "Requires review: confirm landing page matches ad claims.",
      },
    ],
  },
  {
    id: "prv-002",
    campaignId: "cmp-002",
    status: "needs-attention",
    disclaimer: POLICY_DISCLAIMER,
    reviewedAt: "2026-09-22T14:30:00.000Z",
    checks: [
      {
        id: "pc-7",
        label: "Political advertising disclosure",
        status: "needs-attention",
        note: "Potential policy issue detected — paid political disclosure incomplete.",
      },
      {
        id: "pc-8",
        label: "Unsupported claims",
        status: "review",
        note: "Requires review: avoid absolute language about completed works.",
      },
      {
        id: "pc-9",
        label: "Image / text concerns",
        status: "passed",
        note: "Appears aligned with selected platform creative guidelines.",
      },
    ],
  },
];

const campaigns: Campaign[] = [
  {
    id: "cmp-001",
    slug: "kikuyu-water-visibility",
    name: "Kikuyu Water — Project Visibility",
    objective: "project-visibility",
    status: "active",
    platformIds: ["google", "x"],
    leaderId: "ldr-001",
    projectId: "prj-002",
    targeting: {
      country: "Kenya",
      county: "Kiambu",
      constituency: "Kikuyu",
      ward: "Kikuyu",
    },
    startDate: "2026-08-01",
    endDate: "2026-10-31",
    budget: 120000,
    currency: "KES",
    creativeIds: ["cr-001", "cr-002"],
    performance: {
      spend: 70000,
      reach: 284000,
      impressions: 622000,
      engagement: 24600,
      ctr: 1.9,
      conversions: 1230,
      currency: "KES",
    },
    policyReviewId: "prv-001",
    createdAt: "2026-07-28T00:00:00.000Z",
  },
  {
    id: "cmp-002",
    slug: "thika-road-awareness",
    name: "Thika Feeder Roads — Awareness",
    objective: "awareness",
    status: "in-review",
    platformIds: ["google"],
    leaderId: "ldr-001",
    projectId: "prj-001",
    targeting: {
      country: "Kenya",
      county: "Kiambu",
      constituency: "Thika Town",
    },
    startDate: "2026-09-15",
    endDate: "2026-11-15",
    budget: 85000,
    currency: "KES",
    creativeIds: ["cr-002"],
    performance: {
      spend: 0,
      reach: 0,
      impressions: 0,
      engagement: 0,
      ctr: 0,
      conversions: 0,
      currency: "KES",
    },
    policyReviewId: "prv-002",
    createdAt: "2026-09-10T00:00:00.000Z",
  },
  {
    id: "cmp-003",
    slug: "vision-clinic-engagement",
    name: "Proposed Clinic — Engagement",
    objective: "engagement",
    status: "paused",
    platformIds: ["x"],
    leaderId: "ldr-003",
    targeting: {
      country: "Kenya",
      county: "Nairobi",
    },
    startDate: "2026-06-01",
    endDate: "2026-07-31",
    budget: 45000,
    currency: "KES",
    creativeIds: ["cr-003"],
    performance: {
      spend: 45000,
      reach: 72000,
      impressions: 155000,
      engagement: 9100,
      ctr: 3.1,
      conversions: 480,
      currency: "KES",
    },
    createdAt: "2026-05-20T00:00:00.000Z",
  },
];

const posters: Poster[] = [
  {
    id: "pst-001",
    name: "Water for Kikuyu",
    leaderId: "ldr-001",
    projectId: "prj-002",
    type: "development-project",
    format: "1080x1350",
    headline: "Clean water is on the way",
    supporting: "Makongeni Community Water Supply — tracked on M-Taji Siasa",
    cta: "See the work",
    date: "2026",
    location: "Kikuyu, Kiambu",
    portrait:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    projectImage:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
    concepts: [
      { id: "pcpt-1", label: "Concept 01", layout: "hero-full", accent: "#e5b12a" },
      { id: "pcpt-2", label: "Concept 02", layout: "split", accent: "#e5b12a" },
      { id: "pcpt-3", label: "Concept 03", layout: "minimal", accent: "#2ec4a0" },
    ],
    selectedConceptId: "pcpt-1",
    createdAt: "2026-09-01T00:00:00.000Z",
  },
];

const timelapses: Timelapse[] = [
  {
    id: "tl-001",
    name: "Makongeni Water — Progress Story",
    projectId: "prj-002",
    location: "Kikuyu, Kiambu County",
    startDate: "2025-01-01",
    endDate: "2026-08-01",
    progress: 54,
    aspect: "16:9",
    milestones: ["Site clearing", "Pipeline laying", "Tank installation", "Commissioning"],
    captionsEnabled: true,
    brandingEnabled: true,
    createdAt: "2026-09-05T00:00:00.000Z",
    media: [
      {
        id: "tlm-1",
        type: "image",
        url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
        caption: "Site survey",
        capturedAt: "2025-01-15",
        phase: "before",
        order: 0,
      },
      {
        id: "tlm-2",
        type: "drone",
        url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
        caption: "Trenching underway",
        capturedAt: "2025-04-20",
        phase: "during",
        order: 1,
      },
      {
        id: "tlm-3",
        type: "image",
        url: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
        caption: "Main line installation",
        capturedAt: "2025-08-10",
        phase: "during",
        order: 2,
      },
      {
        id: "tlm-4",
        type: "satellite",
        url: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1200&q=80",
        caption: "Corridor overview",
        capturedAt: "2026-01-05",
        phase: "during",
        order: 3,
      },
      {
        id: "tlm-5",
        type: "image",
        url: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&q=80",
        caption: "Tank pad complete",
        capturedAt: "2026-06-18",
        phase: "after",
        order: 4,
      },
    ],
  },
];

const simulations: Simulation[] = [
  {
    id: "sim-001",
    title: "Proposed Kikuyu Community Clinic",
    description:
      "A neighbourhood outpatient clinic with maternity wing — manifesto visualisation.",
    developmentType: "hospital",
    locationLabel: "Kikuyu, Kiambu County",
    geo: { lat: -1.268, lng: 36.666 },
    expectedOutcome: "Improved primary care access within a 5km catchment.",
    style: "photoreal",
    beforeImage:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80",
    afterImage:
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=80",
    leaderId: "ldr-003",
    createdAt: "2026-09-12T00:00:00.000Z",
    isAiSimulation: true,
  },
];

const insights: AdlyInsight[] = [
  {
    id: "ins-001",
    tone: "positive",
    title: "Water campaign outperforming",
    body: "Your water project campaign is receiving higher engagement than your previous campaign.",
    relatedCampaignId: "cmp-001",
  },
  {
    id: "ins-002",
    tone: "attention",
    title: "Creatives need a refresh",
    body: "Two creatives have declining engagement. Consider refreshing the visual.",
    relatedCreativeId: "cr-002",
  },
  {
    id: "ins-003",
    tone: "neutral",
    title: "Policy review pending",
    body: "One creative requires additional platform-policy review before publishing. Final approval is determined by the advertising platform.",
    relatedCampaignId: "cmp-002",
  },
];

export function createSeedAdlyContent(): AdlyContent {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    campaigns: clone(campaigns),
    creatives: clone(creatives),
    policyReviews: clone(policyReviews),
    posters: clone(posters),
    timelapses: clone(timelapses),
    simulations: clone(simulations),
    insights: clone(insights),
  };
}

export function computeAdlyStats(content: AdlyContent) {
  const active = content.campaigns.filter((c) => c.status === "active");
  const all = content.campaigns;
  const spend = all.reduce((s, c) => s + c.performance.spend, 0);
  const reach = all.reduce((s, c) => s + c.performance.reach, 0);
  const impressions = all.reduce((s, c) => s + c.performance.impressions, 0);
  const engagement = all.reduce((s, c) => s + c.performance.engagement, 0);
  const conversions = all.reduce((s, c) => s + c.performance.conversions, 0);
  const ctrs = all
    .map((c) => c.performance.ctr)
    .filter((n) => n > 0);
  const avgCtr = ctrs.length
    ? Number((ctrs.reduce((a, b) => a + b, 0) / ctrs.length).toFixed(2))
    : 0;
  const policyAttentionCount = content.policyReviews.filter(
    (p) => p.status === "needs-attention" || p.status === "review"
  ).length;

  return {
    activeCampaigns: active.length,
    totalSpend: spend,
    reach,
    impressions,
    engagement,
    avgCtr,
    conversions,
    currency: "KES",
    policyAttentionCount,
  };
}
