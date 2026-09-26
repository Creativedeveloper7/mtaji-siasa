"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingState } from "@/components/ui/EmptyState";

export function RequireAuth({
  children,
  roles,
  redirectTo = "/signin",
}: {
  children: ReactNode;
  roles?: Array<"admin" | "citizen" | "leader" | "aspirant" | "organization">;
  redirectTo?: string;
}) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`${redirectTo}?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace("/");
    }
  }, [ready, user, roles, router, redirectTo, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <LoadingState label="Loading account…" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <LoadingState label="Redirecting to sign in…" />
      </div>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <LoadingState label="Checking permissions…" />
      </div>
    );
  }

  return <>{children}</>;
}
