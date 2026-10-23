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

/** Placeholder WhatsApp deep-link for Faida prototype */
export const FAIDA_WHATSAPP_URL =
  "https://wa.me/254700000000?text=Hello%20Faida%2C%20I%20want%20to%20engage%20via%20M-Taji%20Siasa";
