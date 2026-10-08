import type { UserAccount, UserRole } from "@/types/auth";

/** Account fields safe to send over HTTP. The password never leaves the repository. */
export type PublicUser = Omit<UserAccount, "password">;

export function toPublicUser(account: UserAccount): PublicUser {
  const { password: _password, ...publicUser } = account;
  return publicUser;
}

export interface NewUserInput {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
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
  kind: "top-up" | "withdrawal";
  amount: number;
  /** Channel label for a top-up. Not a completed payment. */
  source?: TopUpSource;
  status: "recorded";
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
}
