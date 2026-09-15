"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import type { ChannelProfile } from "@/lib/board/types";
import { DemoBadge, MissingBadge, fmt } from "@/components/board/badges";

export function ChannelCard({ channel, stats, imageUrl }: {
  channel: ChannelProfile;
  stats?: { views: number; subs: number; videos: number; demo: boolean };
  imageUrl?: string | null;
}) {
  const [imgOk, setImgOk] = useState(true);
  const showImage = Boolean(imageUrl) && imgOk;
  return (
    <Card className="space-y-3 overflow-hidden">
      <div className="-mx-5 -mt-5 h-1.5" style={{ backgroundColor: channel.color }} aria-hidden="true" />
      <div className="flex items-start gap-3">
        {showImage ? (
          <img
            src={imageUrl as string}
            alt={`تصویر کانال ${channel.nameFa}`}
            onError={() => setImgOk(false)}
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white"
            style={{ backgroundColor: channel.color }}
            aria-hidden="true"
          >
            {channel.monogram}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-tg-text">{channel.nameFa}</h3>
            {stats?.demo ? <DemoBadge /> : null}
          </div>
          <p className="mt-0.5 text-xs text-tg-secondary">{channel.tagline}</p>
        </div>
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-tg-hover/40 px-2 py-2">
            <p className="text-sm font-bold tabular-nums text-tg-text">{fmt(stats.views)}</p>
            <p className="text-[11px] text-tg-secondary">بازدید</p>
          </div>
          <div className="rounded-lg bg-tg-hover/40 px-2 py-2">
            <p className="text-sm font-bold tabular-nums text-tg-text">{fmt(stats.subs)}</p>
            <p className="text-[11px] text-tg-secondary">مشترک جدید</p>
          </div>
          <div className="rounded-lg bg-tg-hover/40 px-2 py-2">
            <p className="text-sm font-bold tabular-nums text-tg-text">{fmt(stats.videos)}</p>
            <p className="text-[11px] text-tg-secondary">ویدیو</p>
          </div>
        </div>
      )}
      {!stats && <MissingBadge label="اطلاعات موجود نیست" />}
      <div>
        <p className="text-xs font-semibold text-tg-secondary">نوع محتوا</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {channel.contentTypes.map((t) => (
            <span key={t} className="rounded-full bg-tg-hover px-2 py-0.5 text-[11px] text-tg-text">
              {t}
            </span>
          ))}
        </div>
      </div>
      <ul className="space-y-1">
        {channel.status.map((s) => (
          <li key={s} className="flex gap-1.5 text-xs leading-5 text-tg-text">
            <span aria-hidden="true" style={{ color: channel.color }}>•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
      <p className="rounded-lg bg-tg-hover/40 px-3 py-2 text-xs font-medium" style={{ color: channel.color }}>
        {channel.progressNote}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/board/dashboard" className="inline-block text-xs font-medium text-tg-accent hover:underline">
          مشاهده در داشبورد ←
        </Link>
        {channel.youtubeUrl && (
          <a
            href={channel.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-medium text-tg-secondary hover:text-tg-text hover:underline"
          >
            مشاهده کانال در یوتیوب ↗
          </a>
        )}
      </div>
    </Card>
  );
}
