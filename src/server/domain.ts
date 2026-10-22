import type { UserAccount, UserRole } from "@/types/auth";

/** Account fields safe to send over HTTP. Passwords live only in Supabase Auth. */
export type PublicUser = UserAccount;

export interface NewUserInput {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  /** Initial password, handed to the auth provider and never stored by Siasa. */
  password: string;
  role: UserRole;
  createdAt?: string;
  leaderId?: string;
}

export type FundSourceId =
  | "crowdfunding"
  | "merchandise"
  | "donations"
  | "transfers";

export type TopUpSource = "mpesa" | "bank" | "card" | "crowdfunding" | "merchandise";

export interface WalletMovement {
  id: string;
  /** ad-spend: paid for an ad campaign; ad-refund: money returned from one */
  kind: "top-up" | "withdrawal" | "ad-spend" | "ad-refund";
  amount: number;
  /** Channel label for a top-up. Not a completed payment. */
  source?: TopUpSource;
  status: "recorded";
  /** What the movement was for, e.g. the ad campaign name */
  note?: string;
  /** Linked record id, e.g. the ad campaign id */
  reference?: string;
  createdAt: string;
}

export interface WalletRecord {
  leaderId: string;
  sources: Record<FundSourceId, number>;
  lastTopUpAt?: string;
  lastWithdrawalAt?: string;
  movements: WalletMovement[];
}

/** Matches the balances the politician wallet shows before any top-up is saved. */
export const DEFAULT_WALLET_SOURCES: Record<FundSourceId, number> = {
  crowdfunding: 185000,
  merchandise: 62400,
  donations: 41000,
  transfers: 15000,
};

export function defaultWallet(leaderId: string): WalletRecord {
  return {
    leaderId,
    sources: { ...DEFAULT_WALLET_SOURCES },
    movements: [],
  };
}

export interface AdlyInterestLead {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  role: string;
  interests: string[];
  createdAt: string;
}

export interface SeedCounts {
  users: number;
  leaders: number;
  projects: number;
  milestones: number;
  opportunities: number;
  media: number;
  polls: number;
  products: number;
  campaigns: number;
  creatives: number;
  policyReviews: number;
  posters: number;
  timelapses: number;
  simulations: number;
  insights: number;
  wallets: number;
  savedOpportunityLists: number;
  adlyInterests: number;
  applications: number;
  adCampaigns: number;
}
