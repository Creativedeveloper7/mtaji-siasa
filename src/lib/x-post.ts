import type { AdPlatformRun } from "@/types";

/** Public link to an X post. Ad posts are promoted-only but still open by link. */
export function xPostUrl(tweetId: string | undefined | null): string | undefined {
  const id = tweetId?.trim();
  return id && /^\d{5,25}$/.test(id) ? `https://x.com/i/web/status/${id}` : undefined;
}

/** The X post an ad promotes, when it was published to X. */
export function adXPostUrl(platforms: readonly AdPlatformRun[]): string | undefined {
  return xPostUrl(platforms.find((p) => p.platform === "x")?.externalIds?.x_tweet_id);
}
