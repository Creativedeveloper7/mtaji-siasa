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
  /** Prototype only — stored in localStorage, not production-safe */
  password: string;
  role: UserRole;
  createdAt: string;
  /** Linked public Leader profile for politicians */
  leaderId?: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  leaderId?: string;
}
