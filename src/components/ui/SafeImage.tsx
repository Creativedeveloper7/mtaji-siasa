"use client";

import Image, { type ImageProps } from "next/image";

function isLocalSource(src: ImageProps["src"]): boolean {
  return typeof src === "string" && (src.startsWith("data:") || src.startsWith("blob:"));
}

/** next/image wrapper that also supports device uploads stored as data URLs */
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
