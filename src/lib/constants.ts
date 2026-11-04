import type {
  ProjectCategory,
  ProjectStatus,
  OpportunityCategory,
  OpportunityStatus,
  MediaCategory,
  LeaderType,
  ApplicationStatus,
} from "@/types";

export const COUNTIES = [
  "Nairobi",
  "Kiambu",
  "Mombasa",
  "Kisumu",
  "Nakuru",
  "Uasin Gishu",
  "Machakos",
  "Kakamega",
  "Kilifi",
  "Nyeri",
] as const;

/** All 47 counties, for ad targeting. */
export const KENYA_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
  "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia",
  "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi",
  "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita Taveta", "Tana River",
  "Tharaka Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
] as const;

/** An ad's location when it runs everywhere. */
export const AD_ALL_KENYA = "Kenya";
export const AD_MAX_COUNTIES = 5;

/**
 * Age groups an ad can target, in the Tracker's "min-max" form. Each one is an
 * age bucket X accepts (AGE_OVER_18 is left out: "all adults" adds no filter).
 */
export const AD_AGE_GROUPS = [
  { value: "18-65+", label: "All adults (18+)" },
  { value: "18-24", label: "18–24" },
  { value: "18-34", label: "18–34" },
  { value: "25-49", label: "25–49" },
  { value: "35-65+", label: "35 and over" },
  { value: "50-65+", label: "50 and over" },
] as const;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  "in-progress": "In Progress",
  completed: "Completed",
  "on-hold": "On Hold",
};

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  infrastructure: "Infrastructure",
  "non-infrastructure": "Non-Infrastructure",
};

export const OPPORTUNITY_CATEGORY_LABELS: Record<OpportunityCategory, string> =
  {
    jobs: "Jobs",
    tenders: "Tenders",
    training: "Training",
    funding: "Funding",
    youth: "Youth",
    business: "Business",
    other: "Other",
  };

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  open: "Open",
  "closing-soon": "Closing soon",
  closed: "Closed",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  reviewing: "Under review",
  shortlisted: "Shortlisted",
  accepted: "Accepted",
  rejected: "Not selected",
};

export const APPLICATION_STATUS_TONES: Record<
  ApplicationStatus,
  "neutral" | "success" | "warning" | "accent" | "error"
> = {
  submitted: "neutral",
  reviewing: "accent",
  shortlisted: "warning",
  accepted: "success",
  rejected: "error",
};

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  news: "News",
  "project-updates": "Project Updates",
  "leader-updates": "Leader Updates",
  videos: "Videos",
  stories: "Stories",
};

export const LEADER_TYPE_LABELS: Record<LeaderType, string> = {
  elected: "Elected Leader",
  aspirant: "Aspirant",
};

/** Smallest ad budget, in KES. AD_MIN_BUDGET_KES on the server can raise it. */
export const MIN_AD_BUDGET_KES = 100;

/** Longest ad headline and text, in characters (Google headlines are 30). */
export const AD_TEXT_LIMITS = { headline: 30, body: 220 } as const;

/** Share of a Tracker ad budget kept as the platform fee; the rest goes to the networks. */
export const AD_PLATFORM_FEE_RATE = 0.2;

/** KES per US$ the publish functions use to convert budgets for the networks. */
export const AD_KES_PER_USD = 134;

/** KES of an ad budget that reaches the networks after the platform fee. */
export function adMediaKes(budgetKes: number, feeRate: number = AD_PLATFORM_FEE_RATE): number {
  const gross = Math.max(0, Math.round(Number(budgetKes) || 0));
  return gross > 0 ? Math.max(1, Math.round(gross * (1 - feeRate))) : 0;
}

/**
 * Smallest budget on each network, in KES. After the 20% fee KES 160 (≈ $1.19)
 * reaches the network: one day of delivery. X accepts less but barely shows it
 * (a KES 40 ad never ran); the X publish spends at least $1 a day, so a small
 * budget runs fewer days, not thinner.
 */
export const MIN_AD_NETWORK_KES = 200;

/** Smallest total budget for an ad split evenly over `networks` networks. */
export function minAdBudgetKes(networks: number, floor: number = MIN_AD_BUDGET_KES): number {
  return Math.max(floor, MIN_AD_NETWORK_KES * Math.max(1, networks));
}

/** Days an ad's budget lasts when each network spends at least $1 a day. */
export function adRunDays(budgetKes: number, networks: number, days: number, feeRate: number = AD_PLATFORM_FEE_RATE): number {
  const usdPerNetwork = adMediaKes(budgetKes, feeRate) / Math.max(1, networks) / AD_KES_PER_USD;
  return Math.max(1, Math.min(days, Math.floor(usdPerNetwork)));
}

/** Budget, in KES rounded up to 50, that gives each network $1 a day for `days` days. */
export function adBudgetForDays(days: number, networks: number, feeRate: number = AD_PLATFORM_FEE_RATE): number {
  const kes = (AD_KES_PER_USD * Math.max(1, days) * Math.max(1, networks)) / (1 - feeRate);
  return Math.max(minAdBudgetKes(networks), Math.ceil(kes / 50) * 50);
}

/** Placeholder WhatsApp deep-link for Faida prototype */
/** Faida's WhatsApp number (+254 741 686 073), digits only as wa.me expects. */
export const FAIDA_WHATSAPP_NUMBER = "254741686073";

/** WhatsApp chat with Faida, optionally with a message already typed in. */
export function faidaWhatsAppUrl(message = "Hello Faida, I want to engage via M-Taji Siasa"): string {
  return `https://wa.me/${FAIDA_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
