import Link from "next/link";
import type { MediaItem } from "@/types";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Play } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";

interface MediaCardProps {
  item: MediaItem;
  featured?: boolean;
}

export function MediaCard({ item, featured }: MediaCardProps) {
  return (
    <article
      className={
        featured
          ? "group grid overflow-hidden rounded-lg border border-border bg-surface md:grid-cols-2"
          : "group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong"
      }
    >
      <Link href={`/media/${item.slug}`} className="contents">
        <div
          className={
            featured
              ? "relative aspect-[16/11] md:aspect-auto md:min-h-[320px]"
              : "relative aspect-[16/10]"
          }
        >
          <SafeImage
            src={item.image}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.02]"
            sizes={featured ? "100vw" : "(max-width:768px) 100vw, 33vw"}
          />
          {item.type === "video" && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg/70 text-ink backdrop-blur-sm">
                <Play className="h-5 w-5 fill-current" aria-hidden />
              </span>
            </span>
          )}
        </div>
        <div
          className={
            featured
              ? "flex flex-col justify-center p-6 md:p-10"
              : "flex flex-1 flex-col p-5"
          }
        >
          <div className="flex items-center gap-3">
            <span className="meta-label text-accent">
              {MEDIA_CATEGORY_LABELS[item.category]}
            </span>
            <span className="text-caption text-ink-subtle">
              {formatDate(item.date)}
            </span>
          </div>
          <h3
            className={
              featured
                ? "mt-3 text-h1 text-ink"
                : "mt-3 text-h3 text-ink transition-colors group-hover:text-accent"
            }
          >
            {item.title}
          </h3>
          <p
            className={`mt-3 text-ink-muted ${featured ? "text-body" : "text-small line-clamp-3"}`}
          >
            {item.excerpt}
          </p>
          <span className="mt-4 inline-flex text-small text-accent">
            Read Story →
          </span>
        </div>
      </Link>
    </article>
  );
}
