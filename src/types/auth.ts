export type UserRole =
  | "citizen"
  | "leader"
  | "aspirant"
  | "organization"
  | "admin";

export interface UserAccount {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  createdAt: string;
  /** Linked public Leader profile for politicians (Tracker political_figures.id) */
  leaderId?: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  leaderId?: string;
}
