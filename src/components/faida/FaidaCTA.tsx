"use client";

import { MessageCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { useFaida, type FaidaIntent } from "./FaidaProvider";
import { cn } from "@/lib/utils";

const labels: Record<FaidaIntent, string> = {
  connect: "Connect with Faida",
  support: "Support via Faida",
  volunteer: "Continue with Faida",
  movement: "Continue with Faida",
  updates: "Get updates through Faida",
  opportunity: "Join Faida",
  donate: "Continue with Faida",
};

interface FaidaCTAProps {
  intent?: FaidaIntent;
  contextLabel?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  fullWidth?: boolean;
  description?: string;
}

export function FaidaCTA({
  intent = "connect",
  contextLabel,
  label,
  variant = "green",
  size = "md",
  className,
  fullWidth,
  description,
}: FaidaCTAProps) {
  const { openFaida } = useFaida();

  return (
    <div className={cn(description && "space-y-3", className)}>
      {description && (
        <p className="text-small text-ink-muted">{description}</p>
      )}
      <Button
        type="button"
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        onClick={() => openFaida(intent, contextLabel)}
        aria-label={label ?? labels[intent]}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {label ?? labels[intent]}
      </Button>
    </div>
  );
}

export function FaidaBanner({
  title = "Stay connected through M-Taji Faida",
  body = "Faida is M-Taji's WhatsApp-powered engagement and opportunities discovery agent for youth.",
  intent = "connect" as FaidaIntent,
}: {
  title?: string;
  body?: string;
  intent?: FaidaIntent;
}) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-brand-green/30 bg-brand-green/[0.07] px-6 py-8 md:px-10 md:py-10">
      <span aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1" />
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="meta-label text-brand-green">WhatsApp engagement</p>
          <h2 className="mt-3 text-h2 text-ink">{title}</h2>
          <p className="mt-3 text-body text-ink-muted">{body}</p>
        </div>
        <FaidaCTA intent={intent} size="lg" />
      </div>
    </section>
  );
}
