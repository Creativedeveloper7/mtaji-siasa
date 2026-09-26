"use client";

import { Share2, Check, Link2, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  title: string;
  className?: string;
  variant?: "icon" | "button";
  /** Optional absolute or path URL; defaults to current page */
  url?: string;
}

function resolveUrl(url?: string) {
  if (typeof window === "undefined") return url || "";
  if (!url) return window.location.href;
  if (url.startsWith("http")) return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

export function ShareButton({
  title,
  className,
  variant = "button",
  url,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shareNative = async () => {
    const href = resolveUrl(url);
    try {
      if (navigator.share) {
        await navigator.share({ title, url: href });
        setOpen(false);
        return true;
      }
    } catch {
      /* cancelled */
    }
    return false;
  };

  const copyLink = async () => {
    const href = resolveUrl(url);
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setOpen(false);
    } catch {
      /* ignore */
    }
  };

  const openChannel = (channel: "whatsapp" | "x" | "facebook") => {
    const href = encodeURIComponent(resolveUrl(url));
    const text = encodeURIComponent(title);
    const targets = {
      whatsapp: `https://wa.me/?text=${text}%20${href}`,
      x: `https://twitter.com/intent/tweet?text=${text}&url=${href}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${href}`,
    };
    window.open(targets[channel], "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const onPrimary = async () => {
    const usedNative = await shareNative();
    if (!usedNative) setOpen((v) => !v);
  };

  const trigger =
    variant === "icon" ? (
      <button
        type="button"
        onClick={onPrimary}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-ink-muted transition-colors hover:border-border-strong hover:text-ink",
          className
        )}
        aria-label="Share"
        aria-expanded={open}
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={onPrimary}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-transparent px-4 text-small text-ink transition-colors hover:border-accent/50 hover:text-accent",
          className
        )}
        aria-expanded={open}
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        {copied ? "Link copied" : "Share"}
      </button>
    );

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-border bg-bg-elevated shadow-raised animate-slide-up"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-small text-ink hover:bg-surface"
            onClick={copyLink}
          >
            <Link2 className="h-4 w-4 text-ink-muted" aria-hidden />
            Copy link
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-small text-ink hover:bg-surface"
            onClick={() => openChannel("whatsapp")}
          >
            <MessageCircle className="h-4 w-4 text-ink-muted" aria-hidden />
            WhatsApp
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-small text-ink hover:bg-surface"
            onClick={() => openChannel("x")}
          >
            <span className="flex h-4 w-4 items-center justify-center text-caption font-medium text-ink-muted">
              𝕏
            </span>
            X
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-small text-ink hover:bg-surface"
            onClick={() => openChannel("facebook")}
          >
            <span className="flex h-4 w-4 items-center justify-center text-caption font-medium text-ink-muted">
              f
            </span>
            Facebook
          </button>
        </div>
      )}
    </div>
  );
}
