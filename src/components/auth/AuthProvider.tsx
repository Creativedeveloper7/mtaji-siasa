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
import {
  SESSION_STORAGE_KEY,
  USERS_STORAGE_KEY,
  createId,
  createSeedUsers,
  readJson,
  writeJson,
} from "@/lib/store";

interface AuthContextValue {
  user: AuthSession | null;
  users: UserAccount[];
  ready: boolean;
  signIn: (email: string, password: string) =>
    | { ok: true; session: AuthSession }
    | { ok: false; error: string };
  signUp: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    leaderId?: string;
  }) => { ok: true; session: AuthSession } | { ok: false; error: string };
  signOut: () => void;
  updateUser: (user: UserAccount) => void;
  deleteUser: (id: string) => void;
  linkLeaderProfile: (userId: string, leaderId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSession(account: UserAccount): AuthSession {
  return {
    userId: account.id,
    email: account.email,
    fullName: account.fullName,
    role: account.role,
    leaderId: account.leaderId,
  };
}

function hydrateAuthState(): {
  users: UserAccount[];
  user: AuthSession | null;
  ready: boolean;
} {
  if (typeof window === "undefined") {
    return { users: createSeedUsers(), user: null, ready: false };
  }
  try {
    const seeded = createSeedUsers();
    const stored = readJson<UserAccount[] | null>(USERS_STORAGE_KEY, null);
    const merged = stored?.length ? mergeUsers(seeded, stored) : seeded;
    writeJson(USERS_STORAGE_KEY, merged);

    const session = readJson<AuthSession | null>(SESSION_STORAGE_KEY, null);
    if (session) {
      const account = merged.find((u) => u.id === session.userId);
      if (account) {
        const fresh = toSession(account);
        writeJson(SESSION_STORAGE_KEY, fresh);
        return { users: merged, user: fresh, ready: true };
      }
      writeJson(SESSION_STORAGE_KEY, null);
    }
    return { users: merged, user: null, ready: true };
  } catch {
    return { users: createSeedUsers(), user: null, ready: true };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserAccount[]>(() => createSeedUsers());
  const [user, setUser] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const hydrated = hydrateAuthState();
      setUsers(hydrated.users);
      setUser(hydrated.user);
    } catch {
      /* keep seed users */
    } finally {
      setReady(true);
    }
  }, []);

  const persistUsers = useCallback((next: UserAccount[]) => {
    setUsers(next);
    writeJson(USERS_STORAGE_KEY, next);
  }, []);

  const signIn = useCallback(
    (email: string, password: string) => {
      const normalized = email.trim().toLowerCase();
      const account = users.find((u) => u.email.toLowerCase() === normalized);
      if (!account || account.password !== password) {
        return { ok: false as const, error: "Invalid email or password." };
      }
      const session = toSession(account);
      setUser(session);
      writeJson(SESSION_STORAGE_KEY, session);
      return { ok: true as const, session };
    },
    [users]
  );

  const signUp = useCallback(
    (input: {
      fullName: string;
      email: string;
      phone: string;
      password: string;
      role: UserRole;
      leaderId?: string;
    }) => {
      const email = input.email.trim().toLowerCase();
      if (users.some((u) => u.email.toLowerCase() === email)) {
        return { ok: false as const, error: "An account with this email already exists." };
      }
      if (input.password.length < 6) {
        return { ok: false as const, error: "Password must be at least 6 characters." };
      }
      const role: UserRole =
        input.role === "admin" ? "citizen" : input.role;
      const account: UserAccount = {
        id: createId("usr"),
        fullName: input.fullName.trim(),
        email,
        phone: input.phone.trim(),
        password: input.password,
        role,
        createdAt: new Date().toISOString(),
        leaderId: input.leaderId,
      };
      const next = [...users, account];
      persistUsers(next);
      const session = toSession(account);
      setUser(session);
      writeJson(SESSION_STORAGE_KEY, session);
      return { ok: true as const, session };
    },
    [users, persistUsers]
  );

  const signOut = useCallback(() => {
    setUser(null);
    writeJson(SESSION_STORAGE_KEY, null);
  }, []);

  const updateUser = useCallback(
    (account: UserAccount) => {
      const exists = users.some((u) => u.id === account.id);
      const next = exists
        ? users.map((u) => (u.id === account.id ? account : u))
        : [...users, account];
      persistUsers(next);
      if (user?.userId === account.id) {
        const session = toSession(account);
        setUser(session);
        writeJson(SESSION_STORAGE_KEY, session);
      }
    },
    [users, persistUsers, user]
  );

  const linkLeaderProfile = useCallback(
    (userId: string, leaderId: string) => {
      const account = users.find((u) => u.id === userId);
      if (!account) return;
      updateUser({ ...account, leaderId });
    },
    [users, updateUser]
  );

  const deleteUser = useCallback(
    (id: string) => {
      const next = users.filter((u) => u.id !== id);
      persistUsers(next);
      if (user?.userId === id) {
        setUser(null);
        writeJson(SESSION_STORAGE_KEY, null);
      }
    },
    [users, persistUsers, user]
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
    }),
    [
      user,
      users,
      ready,
      signIn,
      signUp,
      signOut,
      updateUser,
      deleteUser,
      linkLeaderProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function mergeUsers(seed: UserAccount[], stored: UserAccount[]) {
  const byEmail = new Map(stored.map((u) => [u.email.toLowerCase(), u]));
  for (const s of seed) {
    const existing = byEmail.get(s.email.toLowerCase());
    if (!existing) {
      byEmail.set(s.email.toLowerCase(), s);
    } else if (!existing.leaderId && s.leaderId) {
      byEmail.set(s.email.toLowerCase(), { ...existing, leaderId: s.leaderId, role: s.role });
    }
  }
  return Array.from(byEmail.values());
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
