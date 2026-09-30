import Link from "next/link";
import { ArrowUpRight, Play } from "lucide-react";
import type { MediaItem } from "@/types";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";

interface MediaCardProps {
  item: MediaItem;
  featured?: boolean;
}

export function MediaCard({ item, featured }: MediaCardProps) {
  const isVideo = item.type === "video";

  return (
    <article
      className={cn(
        "group h-full overflow-hidden border border-border bg-surface transition-colors duration-base hover:border-border-strong",
        featured ? "grid md:grid-cols-2" : "flex flex-col"
      )}
    >
      <Link href={`/media/${item.slug}`} className="contents">
        <div
          className={cn(
            "relative overflow-hidden bg-bg-elevated",
            featured ? "aspect-[16/11] md:aspect-auto md:min-h-[340px]" : "aspect-[16/10]"
          )}
        >
          <SafeImage
            src={item.image}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
            sizes={featured ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 90vw, 33vw"}
          />
          {isVideo && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-[#211b12] shadow-lg">
                <Play className="h-5 w-5 translate-x-px fill-current" aria-hidden />
              </span>
            </span>
          )}
          <span className="image-label absolute bottom-3 left-3">
            {isVideo ? "Video" : featured ? "Featured story" : "Story"}
          </span>
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col",
            featured ? "justify-center p-6 md:p-10" : "px-6 pb-6 pt-6"
          )}
        >
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.11em]">
            <span className="text-brand-green">{MEDIA_CATEGORY_LABELS[item.category]}</span>
            <span className="text-ink-muted">{formatDate(item.date)}</span>
          </div>
          <h3
            className={cn(
              "mt-3 font-extrabold leading-snug text-ink",
              featured ? "text-[1.75rem] md:text-[2.1rem]" : "text-[1.3rem]"
            )}
          >
            {item.title}
          </h3>
          <p
            className={cn(
              "mt-3 leading-relaxed text-ink-muted",
              featured ? "text-body" : "line-clamp-3 flex-1 text-small"
            )}
          >
            {item.excerpt}
          </p>
          <span className="mt-5 flex items-center justify-between border-t border-border pt-4 text-caption font-bold text-ink">
            <span className="transition-colors group-hover:text-accent">
              {isVideo ? "Watch video" : "Read story"}
            </span>
            <ArrowUpRight
              className="h-4 w-4 transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>
      </Link>
    </article>
  );
}
