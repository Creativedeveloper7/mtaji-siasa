"use client";

import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/layout/Logo";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingState } from "@/components/ui/EmptyState";

export default function SignInClient() {
  const { signIn, ready, user } = useAuth();
  const params = useSearchParams();
  const next = params.get("next") || params.get("redirect") || "/";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    const destination =
      next.startsWith("/") && next !== "/"
        ? next
        : user.role === "admin"
          ? "/admin"
          : user.role === "leader" || user.role === "aspirant"
            ? "/dashboard"
            : "/";
    // Hard navigation avoids soft-nav stalls that leave a blank loading screen
    window.location.replace(destination);
  }, [ready, user, next]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready) return;
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const destination =
      next.startsWith("/") && next !== "/"
        ? next
        : result.session.role === "admin"
          ? "/admin"
          : result.session.role === "leader" || result.session.role === "aspirant"
            ? "/dashboard"
            : "/";
    window.location.assign(destination);
  };

  if (!ready) {
    return (
      <section className="container-narrow py-12 md:py-20">
        <Logo size={48} />
        <LoadingState label="Loading account…" />
      </section>
    );
  }

  if (user) {
    return (
      <section className="container-narrow py-12 md:py-20">
        <Logo size={48} />
        <p className="meta-label mt-8 text-accent">Account</p>
        <h1 className="mt-3 text-h1 text-ink">Continuing…</h1>
        <p className="mt-3 text-body text-ink-muted">
          {next.startsWith("/adly")
            ? "Taking you to Adly."
            : "Taking you to your workspace."}
        </p>
      </section>
    );
  }

  return (
    <section className="container-narrow py-12 md:py-20">
      <Logo size={48} />
      <p className="meta-label mt-8 text-accent">Account</p>
      <h1 className="mt-3 text-h1 text-ink">Sign in</h1>
      <p className="mt-3 text-body text-ink-muted">
        Access your M-Taji Siasa account to explore, engage or manage the
        platform.
      </p>

      <form onSubmit={onSubmit} className="mt-10 space-y-4">
        <Field
          label="Email"
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <Field
          label="Password"
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />

        {error && (
          <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth disabled={loading || !ready}>
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-small text-ink-muted">
        New here?{" "}
        <Link
          href={
            next.startsWith("/") && next !== "/"
              ? `/signup?next=${encodeURIComponent(next)}`
              : "/signup"
          }
          className="text-accent hover:text-accent-hover"
        >
          Create an account
        </Link>
      </p>
    </section>
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
