"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { safeThumbnailUrl } from "@/lib/analytics/presentation";

export function AnalyticsThumbnail({
  src,
  title,
  width,
  height,
  className,
}: {
  src: string | null;
  title: string;
  width: number;
  height: number;
  className: string;
}) {
  const safeSrc = safeThumbnailUrl(src);
  const [failed, setFailed] = useState(false);

  if (!safeSrc || failed) {
    return (
      <span className={`flex items-center justify-center bg-tg-hover text-tg-secondary ${className}`} aria-label={`تصویر بندانگشتی ${title} در دسترس نیست`}>
        <ImageOff className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }

  return (
    // Provider-hosted thumbnails have dynamic origins, so next/image cannot validate them at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safeSrc}
      alt={`تصویر بندانگشتی ${title}`}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
