import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "12 Oct 2026". An empty or invalid date gives `fallback` instead of
 * throwing (Intl throws a RangeError on an invalid Date): Tracker records may
 * have no date (a rolling opportunity, a poll without a closing date).
 */
export function formatDate(date: string | null | undefined, fallback = ""): string {
  if (!date) return fallback;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function formatCurrency(amount: number, currency = "KES"): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : plural ?? `${singular}s`;
}
