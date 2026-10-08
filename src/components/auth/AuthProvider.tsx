"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthSession, UserAccount, UserRole } from "@/types/auth";
import { apiJson } from "@/lib/api-client";

interface AuthContextValue {
  user: AuthSession | null;
  users: UserAccount[];
  ready: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }>;
  signUp: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    leaderId?: string;
  }) => Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  updateUser: (user: UserAccount) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  linkLeaderProfile: (userId: string, leaderId: string) => void;
  applySession: (session: AuthSession | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function accountFromPublic(user: Omit<UserAccount, "password"> & { password?: string }): UserAccount {
  return { ...user, password: user.password ?? "" };
}

function accountFromSession(session: AuthSession): UserAccount {
  return {
    id: session.userId,
    fullName: session.fullName,
    email: session.email,
    phone: "",
    password: "",
    role: session.role,
    createdAt: "",
    leaderId: session.leaderId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [user, setUser] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  const loadDirectory = useCallback(async (session: AuthSession | null) => {
    if (session?.role !== "admin") {
      setUsers(session ? [accountFromSession(session)] : []);
      return;
    }
    const result = await apiJson<{ users?: Array<Omit<UserAccount, "password">> }>("/api/auth/users");
    if (!result.ok || !result.data.users) {
      setUsers([accountFromSession(session)]);
      return;
    }
    setUsers(result.data.users.map((account) => accountFromPublic(account)));
  }, []);

  const applySession = useCallback(
    (session: AuthSession | null) => {
      setUser(session);
      void loadDirectory(session);
    },
    [loadDirectory]
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      const result = await apiJson<{ user: AuthSession | null }>("/api/auth/session");
      if (cancel) return;
      const session = result.ok ? result.data.user : null;
      setUser(session);
      await loadDirectory(session);
      if (!cancel) setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, [loadDirectory]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await apiJson<{ ok: boolean; error?: string; session?: AuthSession }>(
        "/api/auth/sign-in",
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      if (!result.ok || !result.data.session) {
        return { ok: false as const, error: result.data.error || "Invalid email or password." };
      }
      applySession(result.data.session);
      return { ok: true as const, session: result.data.session };
    },
    [applySession]
  );

  const signUp = useCallback(
    async (input: {
      fullName: string;
      email: string;
      phone: string;
      password: string;
      role: UserRole;
      leaderId?: string;
    }) => {
      const result = await apiJson<{ ok: boolean; error?: string; session?: AuthSession }>(
        "/api/auth/sign-up",
        { method: "POST", body: JSON.stringify(input) }
      );
      if (!result.ok || !result.data.session) {
        return { ok: false as const, error: result.data.error || "Could not create the account." };
      }
      applySession(result.data.session);
      return { ok: true as const, session: result.data.session };
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    await apiJson("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setUsers([]);
  }, []);

  const updateUser = useCallback(
    async (account: UserAccount) => {
      const payload = account.password ? account : { ...account, password: undefined };
      const result = await apiJson<{ ok: boolean }>("/api/auth/users", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!result.ok) return;
      const session = await apiJson<{ user: AuthSession | null }>("/api/auth/session");
      const next = session.ok ? session.data.user : user;
      setUser(next);
      await loadDirectory(next);
    },
    [loadDirectory, user]
  );

  const deleteUser = useCallback(
    async (id: string) => {
      const result = await apiJson("/api/auth/users?id=" + encodeURIComponent(id), { method: "DELETE" });
      if (!result.ok) return;
      await loadDirectory(user);
    },
    [loadDirectory, user]
  );

  const linkLeaderProfile = useCallback(
    (userId: string, leaderId: string) => {
      const account = users.find((entry) => entry.id === userId);
      if (!account) return;
      void updateUser({ ...account, leaderId });
    },
    [users, updateUser]
  );

  const value = useMemo(
    () => ({
      user,
      users,
      ready,
      signIn,
      signUp,
      signOut,
      updateUser,
      deleteUser,
      linkLeaderProfile,
      applySession,
    }),
    [user, users, ready, signIn, signUp, signOut, updateUser, deleteUser, linkLeaderProfile, applySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
