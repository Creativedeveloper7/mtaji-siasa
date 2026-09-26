"use client";

import { Suspense, useState, type FormEvent, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/layout/Logo";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";
import { LoadingState } from "@/components/ui/EmptyState";

const roles: Array<{
  id: Exclude<UserRole, "admin">;
  title: string;
  description: string;
}> = [
  {
    id: "citizen",
    title: "Citizen",
    description: "Discover leaders, projects and opportunities near you.",
  },
  {
    id: "leader",
    title: "Leader",
    description: "Manage your profile, projects, media and engagement.",
  },
  {
    id: "aspirant",
    title: "Aspirant",
    description: "Publish your vision and run your campaign workspace.",
  },
  {
    id: "organization",
    title: "Organization",
    description: "Partner on visibility, programmes and outreach.",
  },
];

function SignupForm() {
  const { signUp, ready } = useAuth();
  const params = useSearchParams();
  const next =
    params.get("next") || params.get("redirect") || "";
  const [role, setRole] = useState<Exclude<UserRole, "admin">>("citizen");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready) return;
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const result = signUp({
      fullName: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      password: String(form.get("password") || ""),
      role,
    });
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const destination = next.startsWith("/")
      ? next
      : role === "leader" || role === "aspirant"
        ? "/dashboard"
        : "/";
    window.location.assign(destination);
  };

  return (
    <section className="container-narrow py-12 md:py-20">
      <Logo size={48} />
      <p className="meta-label mt-8 text-accent">Account</p>
      <h1 className="mt-3 text-h1 text-ink">Welcome to M-Taji Siasa</h1>
      <p className="mt-3 text-body text-ink-muted">
        How would you like to use M-Taji Siasa?
      </p>

      <form onSubmit={onSubmit} className="mt-10 space-y-8">
        <fieldset>
          <legend className="sr-only">Account type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "cursor-pointer rounded-lg border p-4 transition-colors",
                  role === r.id
                    ? "border-accent/40 bg-accent-soft"
                    : "border-border bg-surface hover:border-border-strong"
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.id}
                  checked={role === r.id}
                  onChange={() => setRole(r.id)}
                  className="sr-only"
                />
                <span className="block text-small font-medium text-ink">
                  {r.title}
                </span>
                <span className="mt-1 block text-caption text-ink-muted">
                  {r.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-4">
          <Field label="Full Name" id="name" name="name" type="text" required autoComplete="name" />
          <Field label="Email" id="email" name="email" type="email" required autoComplete="email" />
          <Field label="Phone" id="phone" name="phone" type="tel" required autoComplete="tel" />
          <Field
            label="Password"
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth disabled={loading || !ready}>
          {loading ? "Creating account…" : "Create Account"}
        </Button>

        <p className="text-center text-small text-ink-muted">
          Already have an account?{" "}
          <Link
            href={
              next.startsWith("/")
                ? `/signin?next=${encodeURIComponent(next)}`
                : "/signin"
            }
            className="text-accent hover:text-accent-hover"
          >
            Sign in
          </Link>
        </p>
      </form>
    </section>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <SignupForm />
    </Suspense>
  );
}

function Field({
  label,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="meta-label">{label}</span>
      <input
        id={id}
        className="h-11 w-full rounded-md border border-border bg-surface px-3 text-small text-ink placeholder:text-ink-subtle transition-colors hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        {...props}
      />
    </label>
  );
}
