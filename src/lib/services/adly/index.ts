/**
 * Adly service boundaries — mock implementations today,
 * replaceable with Meta / Google / TikTok / X / render APIs later.
 */

import type {
  AdPlatformId,
  Campaign,
  PolicyReview,
  Poster,
  Simulation,
  Timelapse,
} from "@/types/adly";

export interface AdsPlatformService {
  listPlatforms(): Promise<AdPlatformId[]>;
  /** Never claims live publish — queues a draft review only */
  submitForReview(campaignId: string): Promise<{ queued: true; note: string }>;
}

export interface PolicyReviewService {
  review(campaign: Campaign): Promise<PolicyReview>;
}

export interface CreativeGenerationService {
  generatePosterConcepts(input: Partial<Poster>): Promise<Poster["concepts"]>;
  generateSimulation(input: Partial<Simulation>): Promise<{
    beforeImage: string;
    afterImage: string;
  }>;
}

export interface VideoRenderService {
  renderTimelapse(timelapse: Timelapse): Promise<{ previewUrl: string; note: string }>;
}

export const mockAdsPlatformService: AdsPlatformService = {
  async listPlatforms() {
    return ["google", "x"];
  },
  async submitForReview(campaignId) {
    return {
      queued: true,
      note: `Campaign ${campaignId} queued for platform review. Final approval is determined by the advertising platform.`,
    };
  },
};

export const mockPolicyReviewService: PolicyReviewService = {
  async review(campaign) {
    return {
      id: `prv-${Date.now().toString(36)}`,
      campaignId: campaign.id,
      status: "review",
      disclaimer:
        "Adly checks your campaign against configured platform requirements. Final approval is determined by the advertising platform.",
      reviewedAt: new Date().toISOString(),
      checks: [
        {
          id: "c1",
          label: "Political advertising disclosure",
          status: "review",
          note: "Requires review — confirm paid political disclosure fields.",
        },
        {
          id: "c2",
          label: "Restricted content",
          status: "passed",
          note: "Appears aligned with selected platform requirements.",
        },
        {
          id: "c3",
          label: "Unsupported claims",
          status: "passed",
          note: "No absolute completion claims detected.",
        },
        {
          id: "c4",
          label: "Targeting concerns",
          status: "passed",
          note: "Geographic targeting only.",
        },
        {
          id: "c5",
          label: "Landing page concerns",
          status: "review",
          note: "Requires review — verify destination matches creative claims.",
        },
      ],
    };
  },
};

export const mockCreativeGenerationService: CreativeGenerationService = {
  async generatePosterConcepts() {
    return [
      { id: `pcpt-${Date.now()}-1`, label: "Concept 01", layout: "hero-full", accent: "#e5b12a" },
      { id: `pcpt-${Date.now()}-2`, label: "Concept 02", layout: "split", accent: "#e5b12a" },
      { id: `pcpt-${Date.now()}-3`, label: "Concept 03", layout: "minimal", accent: "#2ec4a0" },
    ];
  },
  async generateSimulation() {
    return {
      beforeImage:
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80",
      afterImage:
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
    };
  },
};

export const mockVideoRenderService: VideoRenderService = {
  async renderTimelapse(timelapse) {
    return {
      previewUrl: timelapse.media[0]?.url || "",
      note: "Preview composition ready. Full video rendering will connect to a render pipeline later.",
    };
  },
};
