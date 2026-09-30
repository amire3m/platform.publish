"use client";

import { Input, Label, Select, Textarea } from "@/components/ui";

export interface PlaylistOption {
  id: string;
  title: string;
  itemCount: number | null;
}

export type SendKind = "youtube_full" | "highlight" | "reel";

export interface SendVideoValue {
  title: string;
  description: string;
  playlistId: string;
  manualPlaylistId: string;
  youtubeAt: string;
  instagramAt: string;
  caption: string;
  publishToInstagram: boolean;
}

interface Props {
  kind: SendKind;
  kindLabel: string;
  kindDesc: string;
  accent: string;
  partNumber: number;
  productTitle: string;
  hasFile: boolean;
  value: SendVideoValue;
  onChange: (field: keyof SendVideoValue, v: string | boolean) => void;
  playlists: PlaylistOption[];
  playlistsLoading: boolean;
  playlistsError: string | null;
}

export function SendVideoCard({
  kind,
  kindLabel,
  kindDesc,
  accent,
  partNumber,
  productTitle,
  hasFile,
  value,
  onChange,
  playlists,
  playlistsLoading,
  playlistsError,
}: Props) {
  const isReel = kind === "reel";
  return (
    <div className={`rounded-xl border p-3 ${accent}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-tg-text">قسمت {partNumber} — {kindLabel}</p>
          <p className="text-[10px] text-tg-secondary">{kindDesc}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${hasFile ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
          {hasFile ? "فایل ✓" : "بدون فایل"}
        </span>
      </div>

      <div className="grid gap-2">
        <div>
          <div className="flex items-center justify-between">
            <Label>عنوان یوتیوب</Label>
            <span className="text-[10px] text-tg-secondary">{value.title.length}/100</span>
          </div>
          <Input
            value={value.title}
            maxLength={100}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder={`${productTitle} - قسمت ${partNumber}`}
            className="mt-1 text-xs"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>توضیحات یوتیوب</Label>
            <span className="text-[10px] text-tg-secondary">{value.description.length}/5000</span>
          </div>
          <Textarea
            value={value.description}
            maxLength={5000}
            rows={3}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="توضیحات، لینک‌ها، هشتگ..."
            className="mt-1 text-xs"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>پلی‌لیست یوتیوب</Label>
            <Select value={value.playlistId} onChange={(e) => onChange("playlistId", e.target.value)} className="mt-1 text-xs" disabled={playlistsLoading}>
              <option value="">— بدون پلی‌لیست —</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}{p.itemCount != null ? ` (${p.itemCount})` : ""}
                </option>
              ))}
              <option value="__manual">وارد کردن دستی ID...</option>
            </Select>
            {playlistsLoading && <p className="mt-1 text-[10px] text-tg-secondary">در حال خواندن پلی‌لیست‌ها...</p>}
            {playlistsError && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{playlistsError}</p>}
            {value.playlistId === "__manual" && (
              <Input
                value={value.manualPlaylistId}
                onChange={(e) => onChange("manualPlaylistId", e.target.value)}
                placeholder="PLxxxxxxxx"
                className="mt-1.5 text-xs"
                dir="ltr"
              />
            )}
          </div>
          <div>
            <Label>زمان انتشار یوتیوب</Label>
            <Input type="datetime-local" value={value.youtubeAt} onChange={(e) => onChange("youtubeAt", e.target.value)} className="mt-1 text-xs" />
            <p className="mt-1 text-[10px] text-tg-secondary">خالی = انتشار فوری پس از ارسال</p>
          </div>
        </div>

        {isReel && (
          <div className="rounded-lg border border-violet-200 bg-violet-500/5 p-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={value.publishToInstagram}
              onClick={() => onChange("publishToInstagram", !value.publishToInstagram)}
              className="flex w-full items-center justify-between gap-2 text-right"
            >
              <span className="text-xs font-bold text-tg-text">انتشار همزمان در اینستاگرام</span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value.publishToInstagram ? "bg-tg-accent" : "bg-tg-hover"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${value.publishToInstagram ? "right-0.5" : "left-0.5"}`} />
              </span>
            </button>
            {value.publishToInstagram && (
              <div className="mt-2 grid gap-2">
                <div>
                  <Label>کپشن اینستاگرام</Label>
                  <Textarea
                    value={value.caption}
                    maxLength={2200}
                    rows={2}
                    onChange={(e) => onChange("caption", e.target.value)}
                    placeholder="کپشن کوتاه + هشتگ..."
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label>زمان انتشار اینستاگرام</Label>
                  <Input type="datetime-local" value={value.instagramAt} onChange={(e) => onChange("instagramAt", e.target.value)} className="mt-1 text-xs" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
