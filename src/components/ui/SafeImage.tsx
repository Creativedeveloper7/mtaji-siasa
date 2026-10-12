"use client";

import Image, { type ImageProps } from "next/image";

/** Hosts listed under images.remotePatterns in next.config.ts. */
const OPTIMIZED_HOSTS = new Set(["images.unsplash.com"]);

/**
 * True when next/image cannot load the source: device uploads (data:/blob:) and
 * pasted links from hosts that are not configured. next/image throws on those.
 */
function isLocalSource(src: ImageProps["src"]): boolean {
  if (typeof src !== "string") return false;
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  if (src.startsWith("/")) return false;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return true;
    if (OPTIMIZED_HOSTS.has(url.hostname)) return false;
    const supabaseUpload =
      url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/");
    return !supabaseUpload;
  } catch {
    return true;
  }
}

/** next/image wrapper that also supports device uploads and links from any host */
export function SafeImage({ src, alt, className, fill, sizes, priority, ...rest }: ImageProps) {
  if (isLocalSource(src)) {
    if (fill) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          className={className ? `absolute inset-0 h-full w-full ${className}` : "absolute inset-0 h-full w-full object-cover"}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src as string} alt={alt} className={className} />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      fill={fill}
      sizes={sizes}
      priority={priority}
      {...rest}
    />
  );
}
