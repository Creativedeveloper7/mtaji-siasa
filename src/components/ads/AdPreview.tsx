"use client";

import { useState } from "react";
import { BadgeCheck, BarChart3, Heart, Info, MessageCircle, MoreHorizontal, Repeat2, Share } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdPreviewProps {
  advertiser: string;
  handle?: string;
  avatar?: string;
  headline: string;
  body: string;
  imageUrl: string;
  landingUrl: string;
  /** Which previews to offer */
  platforms: ("x" | "google")[];
}

type Tab = "x" | "google-landscape" | "google-square";

/** Approximate look of the ad on each network, built from the composer fields. */
export function AdPreview(props: AdPreviewProps) {
  const tabs: { id: Tab; label: string }[] = [
    ...(props.platforms.includes("x") ? [{ id: "x" as const, label: "X post" }] : []),
    ...(props.platforms.includes("google")
      ? [
          { id: "google-landscape" as const, label: "Google · wide" },
          { id: "google-square" as const, label: "Google · square" },
        ]
      : []),
  ];
  const [chosen, setChosen] = useState<Tab>("x");
  const active = tabs.find((t) => t.id === chosen)?.id ?? tabs[0]?.id;

  if (!active) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-small text-ink-muted">
        Choose X or Google to see a preview.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Ad preview">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setChosen(tab.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-caption font-medium transition-colors",
              active === tab.id ? "bg-accent text-ink-inverse" : "bg-surface text-ink-muted hover:text-ink"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === "x" && <XPreview {...props} />}
      {active === "google-landscape" && <GoogleLandscape {...props} />}
      {active === "google-square" && <GoogleSquare {...props} />}
      <p className="mt-3 flex items-start gap-1.5 text-caption text-ink-subtle">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Preview only. Each network adjusts the layout to the placement and screen.
      </p>
    </div>
  );
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Photo({ src, ratio, className }: { src: string; ratio: string; className?: string }) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-bg-elevated", className)} style={{ aspectRatio: ratio }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-caption text-ink-subtle">
          Project image
        </span>
      )}
    </div>
  );
}

function XPreview({ advertiser, handle, avatar, headline, body, imageUrl, landingUrl }: AdPreviewProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#2f3336] bg-black p-4 text-[15px] leading-5 text-[#e7e9ea]">
      <div className="flex gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#333]">
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate font-bold">{advertiser}</span>
            <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" aria-hidden />
            <span className="truncate text-[#71767b]">@{handle || "mtajisiasa"}</span>
            <MoreHorizontal className="ml-auto h-4 w-4 shrink-0 text-[#71767b]" aria-hidden />
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">
            <span className="font-bold">{headline || "Your headline"}</span>
            {"\n\n"}
            {body || "Your ad text appears here."}
            {"\n"}
            <span className="text-[#1d9bf0]">{host(landingUrl)}</span>
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-[#2f3336]">
            <Photo src={imageUrl} ratio="1.91 / 1" />
          </div>
          <div className="mt-3 flex max-w-sm justify-between text-[13px] text-[#71767b]">
            <MessageCircle className="h-4 w-4" aria-hidden />
            <Repeat2 className="h-4 w-4" aria-hidden />
            <Heart className="h-4 w-4" aria-hidden />
            <BarChart3 className="h-4 w-4" aria-hidden />
            <Share className="h-4 w-4" aria-hidden />
          </div>
          <p className="mt-2 text-[13px] text-[#71767b]">Ad</p>
        </div>
      </div>
    </article>
  );
}

function GoogleLandscape({ advertiser, headline, body, imageUrl, landingUrl }: AdPreviewProps) {
  return (
    <article className="overflow-hidden rounded-lg border border-[#dadce0] bg-white text-[#202124]">
      <Photo src={imageUrl} ratio="1.91 / 1" />
      <div className="p-4">
        <p className="text-[18px] font-medium leading-6">{headline || "Your headline"}</p>
        <p className="mt-1 line-clamp-2 text-[14px] text-[#5f6368]">{body || "Your ad text appears here."}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[12px] text-[#5f6368]">
            <span className="mr-1.5 rounded-sm bg-[#fbbc04] px-1 py-px text-[11px] font-bold text-[#202124]">Ad</span>
            {advertiser} · {host(landingUrl)}
          </p>
          <span className="shrink-0 rounded-full bg-[#1a73e8] px-4 py-1.5 text-[13px] font-medium text-white">Open</span>
        </div>
      </div>
    </article>
  );
}

function GoogleSquare({ advertiser, headline, body, imageUrl, landingUrl }: AdPreviewProps) {
  return (
    <article className="mx-auto max-w-[300px] overflow-hidden rounded-lg border border-[#dadce0] bg-white text-[#202124]">
      <Photo src={imageUrl} ratio="1 / 1" />
      <div className="p-3">
        <p className="text-[16px] font-medium leading-5">{headline || "Your headline"}</p>
        <p className="mt-1 line-clamp-3 text-[13px] text-[#5f6368]">{body || "Your ad text appears here."}</p>
        <p className="mt-2 truncate text-[11px] text-[#5f6368]">
          <span className="mr-1 rounded-sm bg-[#fbbc04] px-1 font-bold text-[#202124]">Ad</span>
          {advertiser} · {host(landingUrl)}
        </p>
      </div>
    </article>
  );
}
