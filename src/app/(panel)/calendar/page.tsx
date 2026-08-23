"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { Button, Card, Select, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import {
  buildJalaliMonthGrid,
  formatJalaliDateTime,
  jalaliToUtcIso,
  todayJalali,
  toPersianDigits,
  JALALI_MONTH_LABELS,
  JALALI_WEEKDAY_LABELS,
} from "@/lib/date/jalali";
import { CHANNELS } from "@/lib/channels";
import {
  detectChannelConflicts,
  formatConflictTooltip,
  getEventUid,
  wouldConflict,
} from "@/lib/calendar-conflicts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CalendarEvent {
  contentId: string;
  publicationId?: string | null;
  title: string;
  platform: string;
  accountId: string;
  channel?: string | null;
  channelLabel?: string | null;
  contentType: string;
  status: string;
  publishAtUtc: string;
  publishAtJalali: string;
  contentStatus: string;
  hasError: boolean;
}

export default function CalendarPage() {
  const today = todayJalali();
  const [jy, setJy] = useState(today.jy);
  const [jm, setJm] = useState(today.jm);
  const [platform, setPlatform] = useState("");
  const [channel, setChannel] = useState("");
  const [mode, setMode] = useState<"month" | "list">("month");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();

  const query = new URLSearchParams();
  if (platform) query.set("platform", platform);
  if (channel) query.set("channel", channel);
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: CalendarEvent[] }>(
    `/api/calendar?${query.toString()}`,
    fetcher
  );
  const rawEvents = useMemo(() => data?.data ?? [], [data]);

  // client-side filter fallback (API already filters but keep for local channel filtering if needed)
  const events = useMemo(() => {
    return rawEvents.filter((e) => {
      if (platform && e.platform !== platform) return false;
      if (channel && (e.channel ?? "") !== channel) return false;
      return true;
    });
  }, [rawEvents, platform, channel]);

  const conflicts = useMemo(() => detectChannelConflicts(events, 60), [events]);

  const grid = useMemo(() => buildJalaliMonthGrid(jy, jm), [jy, jm]);

  function eventsForDay(jyv: number, jmv: number, jdv: number) {
    return events.filter((e) => {
      const datePart = e.publishAtJalali?.split(" ")[0];
      if (!datePart) {
        // fallback from publishAtUtc using jalali conversion? use UTC iso comparison
        // approximate: skip if no jalali
        return false;
      }
      const parts = datePart.split("/").map(Number);
      if (!parts || parts.length < 3) return false;
      return parts[0] === jyv && parts[1] === jmv && parts[2] === jdv;
    });
  }

  async function handleDrop(ev: React.DragEvent, jyv: number, jmv: number, jdv: number) {
    ev.preventDefault();
    setDragOverKey(null);
    const publicationId = ev.dataTransfer.getData("publicationId");
    const contentId = ev.dataTransfer.getData("contentId");
    const platformVal = ev.dataTransfer.getData("platform");
    const accountId = ev.dataTransfer.getData("accountId");
    const channelVal = ev.dataTransfer.getData("channel");
    const title = ev.dataTransfer.getData("title");
    const timeStr = ev.dataTransfer.getData("time"); // HH:mm
    if (!publicationId && !contentId) {
      setDraggingId(null);
      return;
    }
    const uid = publicationId ? `pub:${publicationId}` : `cnt:${contentId}:${platformVal}:${accountId}`;
    setReschedulingId(uid);
    const [hhRaw, mmRaw] = timeStr.split(":").map(Number);
    const hh = Number.isFinite(hhRaw) ? hhRaw : 12;
    const mm = Number.isFinite(mmRaw) ? mmRaw : 0;
    const utc = jalaliToUtcIso(jyv, jmv, jdv, hh, mm);
    const pad = (n: number) => String(n).padStart(2, "0");
    const jalaliSlash = `${jyv}/${pad(jmv)}/${pad(jdv)} ${pad(hh)}:${pad(mm)}`;

    // pre-drop channel conflict detection
    const candidate: CalendarEvent = {
      contentId: contentId || "",
      publicationId: publicationId || null,
      title: title || "",
      platform: platformVal || "youtube",
      accountId: accountId || "",
      channel: channelVal || null,
      channelLabel: null,
      contentType: "",
      status: "scheduled",
      publishAtUtc: utc,
      publishAtJalali: jalaliSlash,
      contentStatus: "",
      hasError: false,
    };
    const conflictCheck = wouldConflict(candidate as never, events as never, 60);
    if (conflictCheck.hasConflict) {
      showToast(`تداخل کانال: هم‌زمان با ${conflictCheck.conflictingTitles.join("، ")}`, "error");
    }

    try {
      let res: Response;
      if (publicationId) {
        res = await fetch(`/api/calendar/targets/${publicationId}/reschedule`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scheduledAtUtc: utc, scheduledAtJalali: jalaliSlash }),
        });
      } else {
        res = await fetch(`/api/calendar/${contentId}/reschedule`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scheduledAtUtc: utc, scheduledAtJalali: jalaliSlash }),
        });
      }
      const json = await res.json();
      if (!json.ok) {
        // handle VERSION_CONFLICT 409 specifically - preserve and refresh
        if (res.status === 409 || json.code === "VERSION_CONFLICT" || json.error?.includes?.("نسخه")) {
          showToast("نسخه قدیمی است، داده‌ها بازخوانی شد و تغییرات حفظ شد.", "error");
          await mutate();
          return;
        }
        showToast(json.error ?? "تغییر زمان ناموفق بود.", "error");
        return;
      }
      showToast("زمان انتشار تغییر کرد.", "success");
      await mutate();
    } catch {
      showToast("خطا در ارتباط با سرور.", "error");
    } finally {
      setReschedulingId(null);
      setDraggingId(null);
    }
  }

  function handleDragStart(
    ev: React.DragEvent,
    e: CalendarEvent
  ) {
    const uid = getEventUid(e as never);
    setDraggingId(uid);
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("contentId", e.contentId);
    if (e.publicationId) ev.dataTransfer.setData("publicationId", e.publicationId);
    ev.dataTransfer.setData("time", e.publishAtJalali?.split(" ")[1] ?? "12:00");
    ev.dataTransfer.setData("platform", e.platform);
    ev.dataTransfer.setData("accountId", e.accountId);
    ev.dataTransfer.setData("channel", e.channel ?? "");
    ev.dataTransfer.setData("title", e.title);
    // ghost image
    if (ghostRef.current) {
      ghostRef.current.textContent = e.title;
      ghostRef.current.style.display = "block";
      ev.dataTransfer.setDragImage(ghostRef.current, 10, 10);
      // hide after drag image captured
      setTimeout(() => {
        if (ghostRef.current) ghostRef.current.style.display = "none";
      }, 0);
    }
    // also set opacity via data
  }

  function prevMonth() {
    if (jm === 1) {
      setJm(12);
      setJy((y) => y - 1);
    } else setJm((m) => m - 1);
  }
  function nextMonth() {
    if (jm === 12) {
      setJm(1);
      setJy((y) => y + 1);
    } else setJm((m) => m + 1);
  }

  // Badge counts
  const conflictCount = conflicts.totalConflicts;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ghost for drag */}
      <div
        ref={ghostRef}
        className="pointer-events-none fixed left-0 top-0 z-50 hidden rounded-lg border border-tg-border bg-tg-surface px-3 py-1.5 text-xs font-medium shadow-lg"
        style={{ display: "none" }}
      />

      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-tg-text sm:text-xl">تقویم انتشار (جلالی)</h1>
          <p className="text-xs text-tg-secondary sm:text-sm">مشاهده و جابه‌جایی زمان‌بندی محتوا با کشیدن و رها کردن</p>
          {conflictCount > 0 && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              {toPersianDigits(conflictCount)} تداخل کانال شناسایی شد
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="min-w-[130px] max-w-[160px] flex-1 sm:flex-none"
            aria-label="فیلتر کانال"
          >
            <option value="">همه کانال‌ها</option>
            {CHANNELS.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.labelFa}
              </option>
            ))}
          </Select>
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="min-w-[130px] max-w-[160px] flex-1 sm:flex-none"
            aria-label="فیلتر پلتفرم"
          >
            <option value="">همه پلتفرم‌ها</option>
            <option value="youtube">یوتیوب</option>
            <option value="instagram">اینستاگرام</option>
            <option value="telegram">تلگرام</option>
          </Select>
          <div className="flex gap-1">
            <Button size="sm" variant={mode === "month" ? "primary" : "secondary"} onClick={() => setMode("month")}>
              ماهانه
            </Button>
            <Button size="sm" variant={mode === "list" ? "primary" : "secondary"} onClick={() => setMode("list")}>
              لیست
            </Button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-sm text-tg-secondary">
          <Loader2 className="h-4 w-4 animate-spin me-2" /> در حال بارگذاری...
        </div>
      )}

      {mode === "month" && !isLoading && (
        <Card className="p-2 sm:p-5">
          <div className="mb-3 flex items-center justify-between sm:mb-4">
            <Button size="sm" variant="secondary" onClick={prevMonth} className="text-xs">
              <ChevronRight className="h-4 w-4" />
              <span className="hidden sm:inline">ماه قبل</span>
              <span className="sm:hidden">قبل</span>
            </Button>
            <p className="text-sm font-semibold sm:text-base">
              {JALALI_MONTH_LABELS[jm - 1]} {toPersianDigits(jy)}
            </p>
            <Button size="sm" variant="secondary" onClick={nextMonth} className="text-xs">
              <span className="hidden sm:inline">ماه بعد</span>
              <span className="sm:hidden">بعد</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-tg-secondary sm:gap-1.5 sm:text-xs">
            {JALALI_WEEKDAY_LABELS.map((d) => (
              <div key={d} className="pb-1 font-semibold">
                {d}
              </div>
            ))}
            {grid.map((cell, idx) => {
              const dayEvents = eventsForDay(cell.jy, cell.jm, cell.jd);
              const cellKey = `${cell.jy}-${cell.jm}-${cell.jd}`;
              const isDragOver = dragOverKey === cellKey;
              return (
                <div
                  key={idx}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverKey !== cellKey) setDragOverKey(cellKey);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === cellKey ? null : k))}
                  onDrop={(e) => handleDrop(e, cell.jy, cell.jm, cell.jd)}
                  className={`relative min-h-[72px] rounded-lg border p-1 text-right transition sm:min-h-[90px] sm:p-1.5 ${
                    cell.inMonth ? "border-tg-border bg-tg-surface" : "border-transparent bg-tg-hover/60 text-tg-text/60"
                  } ${isDragOver ? "ring-2 ring-tg-accent ring-offset-1 bg-tg-accent/5" : ""}`}
                >
                  <p className="text-[11px] font-medium sm:text-xs">{toPersianDigits(cell.jd)}</p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((e) => {
                      const uid = getEventUid(e as never);
                      const isConflict = conflicts.conflictIds.has(uid);
                      const info = conflicts.conflictMap.get(uid);
                      const tooltip = isConflict && info ? formatConflictTooltip(info.conflictingTitles) : e.title;
                      const isDragging = draggingId === uid;
                      const isRescheduling = reschedulingId === uid;
                      return (
                        <div
                          key={`${e.contentId}-${e.platform}-${e.publicationId ?? ""}`}
                          draggable={!isRescheduling}
                          onDragStart={(ev) => handleDragStart(ev, e)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverKey(null);
                          }}
                          className={`group cursor-move truncate rounded px-1 py-0.5 text-[10px] sm:text-[11px] flex items-center gap-1 transition ${
                            isConflict
                              ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-1 ring-orange-400/50"
                              : e.hasError
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                : e.status === "published"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-tg-accent/10 text-tg-accent"
                          } ${isDragging ? "opacity-40 scale-[0.98]" : "opacity-100"} ${isRescheduling ? "opacity-60 pointer-events-none" : ""}`}
                          title={tooltip}
                          aria-label={tooltip}
                        >
                          <span className="inline-flex shrink-0 items-center">
                            {e.platform === "youtube" ? (
                              <YoutubeIcon className="h-3 w-3" />
                            ) : e.platform === "instagram" ? (
                              <InstagramIcon className="h-3 w-3" />
                            ) : (
                              <span className="text-[9px]">✈️</span>
                            )}
                          </span>
                          <span className="truncate flex-1">{e.title}</span>
                          {isConflict && <AlertTriangle className="h-3 w-3 shrink-0 text-orange-500" aria-hidden />}
                          {isRescheduling && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-tg-secondary/80">+{toPersianDigits(dayEvents.length - 3)} مورد دیگر</p>
                    )}
                    {isDragOver && (
                      <div className="pointer-events-none absolute inset-1 rounded-md border-2 border-dashed border-tg-accent/50 bg-tg-accent/5" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-tg-secondary sm:hidden">برای جابه‌جایی، رویداد را لمس و نگه دارید (در دسکتاپ بکشید)</p>
        </Card>
      )}

      {mode === "list" && !isLoading && (
        <Card className="divide-y divide-tg-border p-0 overflow-hidden">
          {events
            .slice()
            .sort((a, b) => new Date(a.publishAtUtc).getTime() - new Date(b.publishAtUtc).getTime())
            .map((e) => {
              const uid = getEventUid(e as never);
              const isConflict = conflicts.conflictIds.has(uid);
              const info = conflicts.conflictMap.get(uid);
              const tooltip = isConflict && info ? formatConflictTooltip(info.conflictingTitles) : undefined;
              const isRescheduling = reschedulingId === uid;
              return (
                <Link
                  key={`${e.contentId}-${e.platform}-${e.publicationId ?? ""}`}
                  href={`/content/${e.contentId}`}
                  className={`flex flex-col gap-1 p-3 text-sm hover:bg-tg-hover sm:flex-row sm:items-center sm:justify-between ${
                    isConflict ? "bg-orange-500/5" : ""
                  }`}
                  title={tooltip}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-tg-secondary shrink-0">
                      {e.platform === "youtube" ? (
                        <YoutubeIcon className="h-4 w-4 text-red-500" />
                      ) : e.platform === "instagram" ? (
                        <InstagramIcon className="h-4 w-4 text-fuchsia-500" />
                      ) : (
                        <span className="text-xs">✈️</span>
                      )}
                    </span>
                    <span className="truncate">{e.title}</span>
                    {e.channelLabel && (
                      <span className="rounded bg-tg-hover px-1.5 py-0.5 text-[10px] text-tg-secondary">{e.channelLabel}</span>
                    )}
                    {isConflict && (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300"
                        title={tooltip}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        تداخل
                      </span>
                    )}
                    {isRescheduling && <Loader2 className="h-3 w-3 animate-spin text-tg-secondary" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-tg-secondary sm:shrink-0">
                    <span className="text-[11px] sm:text-xs">{formatJalaliDateTime(e.publishAtUtc)}</span>
                    <StatusBadge status={e.status} />
                  </div>
                </Link>
              );
            })}
          {events.length === 0 && (
            <p className="p-6 text-center text-sm text-tg-secondary">هیچ محتوای زمان‌بندی‌شده‌ای وجود ندارد.</p>
          )}
        </Card>
      )}
    </div>
  );
}
