"use client";

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardCarouselProps {
  children: ReactNode;
  /** Accessible name for the carousel region */
  label: string;
  /**
   * "grid" — swipe carousel below md, grid from md upward (gridClassName).
   * "carousel" — carousel at every size (slideClassName sets widths).
   */
  desktop?: "grid" | "carousel";
  /** Grid classes applied from md upward, e.g. "md:grid-cols-2 lg:grid-cols-3" */
  gridClassName?: string;
  /** Slide width classes, used in "carousel" mode */
  slideClassName?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function CardCarousel({
  children,
  label,
  desktop = "grid",
  gridClassName = "md:grid-cols-2 lg:grid-cols-3",
  slideClassName = "w-[86%] sm:w-[62%] md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]",
  className,
}: CardCarouselProps) {
  const items = Children.toArray(children);
  const count = items.length;
  const isGrid = desktop === "grid";
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [overflowing, setOverflowing] = useState(true);
  const frame = useRef<number | null>(null);
  // Ignore scroll-derived updates while a button-driven smooth scroll settles
  const lockUntil = useRef(0);

  const slideOffset = useCallback((index: number) => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return 0;
    const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    return slide.offsetLeft - padLeft;
  }, []);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setOverflowing(max > 4);
    if (Date.now() < lockUntil.current) return;
    if (max <= 4) {
      setActive(0);
      return;
    }
    if (track.scrollLeft >= max - 4) {
      setActive(count - 1);
      return;
    }
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < count; i++) {
      const d = Math.abs(slideOffset(i) - track.scrollLeft);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setActive(nearest);
  }, [count, slideOffset]);

  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      measure();
    });
  };

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(count - 1, index));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setActive(clamped);
    lockUntil.current = reduce ? 0 : Date.now() + 500;
    track.scrollTo({
      left: slideOffset(clamped),
      behavior: reduce ? "auto" : "smooth",
    });
  };

  if (count === 0) return null;

  const atEnd = active === count - 1;

  return (
    <div className={className}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => {
          lockUntil.current = 0;
        }}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        className={cn(
          "card-carousel relative -mx-[var(--container-pad)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--container-pad)] pb-1",
          isGrid
            ? cn("md:mx-0 md:grid md:snap-none md:overflow-visible md:px-0 md:pb-0", gridClassName)
            : "md:mx-0 md:gap-6 md:px-0"
        )}
      >
        {items.map((child, i) => (
          <div
            key={(child as { key?: string | null }).key ?? i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            className={cn(
              "shrink-0 snap-start",
              isGrid ? "w-[86%] sm:w-[62%] md:w-auto" : slideClassName
            )}
          >
            {child}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div
          className={cn(
            "mt-6 flex items-center justify-between gap-4",
            isGrid && "md:hidden",
            !isGrid && !overflowing && "hidden"
          )}
        >
          <div className="flex items-center gap-4">
            <span
              className="text-caption font-bold tracking-[0.08em] text-ink"
              aria-live="polite"
            >
              {pad(active + 1)}
              <span className="mx-1.5 font-normal text-ink-subtle">/</span>
              {pad(count)}
            </span>
            <div className="flex items-center gap-1.5" aria-hidden>
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  onClick={() => goTo(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-base ease-premium",
                    i === active
                      ? "w-6 bg-accent"
                      : "w-1.5 bg-ink-subtle/40 hover:bg-ink-subtle"
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              disabled={active === 0}
              aria-label={`Previous ${label.toLowerCase()}`}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-surface text-ink transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              disabled={atEnd}
              aria-label={`Next ${label.toLowerCase()}`}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-surface text-ink transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
