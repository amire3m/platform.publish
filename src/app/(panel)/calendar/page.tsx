"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CalendarEvent {
  contentId: string;
  title: string;
  platform: string;
  accountId: string;
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
  const [mode, setMode] = useState<"month" | "list">("month");
  const { showToast } = useToast();

  const query = new URLSearchParams();
  if (platform) query.set("platform", platform);
  const { data, mutate } = useSWR<{ ok: boolean; data: CalendarEvent[] }>(`/api/calendar?${query.toString()}`, fetcher);
  const events = useMemo(() => data?.data ?? [], [data]);

  const grid = useMemo(() => buildJalaliMonthGrid(jy, jm), [jy, jm]);

  function eventsForDay(jyv: number, jmv: number, jdv: number) {
    return events.filter((e) => {
      const parts = e.publishAtJalali?.split(" ")[0]?.split("/").map(Number);
      if (!parts) return false;
      return parts[0] === jyv && parts[1] === jmv && parts[2] === jdv;
    });
  }

  async function handleDrop(ev: React.DragEvent, jyv: number, jmv: number, jdv: number) {
    ev.preventDefault();
    const contentId = ev.dataTransfer.getData("contentId");
    const timeStr = ev.dataTransfer.getData("time"); // HH:mm
    if (!contentId) return;
    const [hh, mm] = timeStr.split(":").map(Number);
    const utc = jalaliToUtcIso(jyv, jmv, jdv, hh || 12, mm || 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const jalaliSlash = `${jyv}/${pad(jmv)}/${pad(jdv)} ${pad(hh || 12)}:${pad(mm || 0)}`;
    const res = await fetch(`/api/calendar/${contentId}/reschedule`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledAtUtc: utc, scheduledAtJalali: jalaliSlash }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error ?? "تغییر زمان ناموفق بود.", "error");
    showToast("زمان انتشار تغییر کرد.", "success");
    mutate();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">تقویم انتشار (جلالی)</h1>
          <p className="text-sm text-tg-secondary">مشاهده و جابه‌جایی زمان‌بندی محتوا با کشیدن و رها کردن</p>
        </div>
        <div className="flex gap-2">
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="max-w-[160px]">
            <option value="">همه پلتفرم‌ها</option>
            <option value="youtube">یوتیوب</option>
            <option value="instagram">اینستاگرام</option>
          </Select>
          <Button size="sm" variant={mode === "month" ? "primary" : "secondary"} onClick={() => setMode("month")}>
            ماهانه
          </Button>
          <Button size="sm" variant={mode === "list" ? "primary" : "secondary"} onClick={() => setMode("list")}>
            لیست
          </Button>
        </div>
      </div>

      {mode === "month" && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <Button size="sm" variant="secondary" onClick={prevMonth}>
              <ChevronRight className="h-4 w-4" />
              ماه قبل
            </Button>
            <p className="font-semibold">
              {JALALI_MONTH_LABELS[jm - 1]} {toPersianDigits(jy)}
            </p>
            <Button size="sm" variant="secondary" onClick={nextMonth}>
              ماه بعد
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-tg-secondary">
            {JALALI_WEEKDAY_LABELS.map((d) => (
              <div key={d} className="pb-1 font-semibold">
                {d}
              </div>
            ))}
            {grid.map((cell, idx) => {
              const dayEvents = eventsForDay(cell.jy, cell.jm, cell.jd);
              return (
                <div
                  key={idx}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, cell.jy, cell.jm, cell.jd)}
                  className={`min-h-[90px] rounded-lg border p-1 text-right ${
                    cell.inMonth ? "border-tg-border bg-tg-surface" : "border-transparent bg-tg-hover text-tg-text/75"
                  }`}
                >
                  <p className="text-[11px]">{toPersianDigits(cell.jd)}</p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={`${e.contentId}-${e.platform}`}
                        draggable
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData("contentId", e.contentId);
                          ev.dataTransfer.setData("time", e.publishAtJalali?.split(" ")[1] ?? "12:00");
                        }}
                        className={`cursor-move truncate rounded px-1 py-0.5 text-[10px] ${
                          e.hasError ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : e.status === "published" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-tg-accent/10 text-tg-accent"
                        }`}
                        title={e.title}
                      >
                        <span className="inline-flex items-center gap-1">
                          {e.platform === "youtube" ? <YoutubeIcon className="h-3 w-3" /> : <InstagramIcon className="h-3 w-3" />}
                          {e.title}
                        </span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && <p className="text-[10px] text-tg-secondary/80">+{toPersianDigits(dayEvents.length - 3)} مورد دیگر</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {mode === "list" && (
        <Card className="divide-y divide-tg-border p-0">
          {events
            .sort((a, b) => new Date(a.publishAtUtc).getTime() - new Date(b.publishAtUtc).getTime())
            .map((e) => (
              <Link key={`${e.contentId}-${e.platform}`} href={`/content/${e.contentId}`} className="flex items-center justify-between p-3 text-sm hover:bg-tg-hover">
                <div className="flex items-center gap-2">
                  <span className="text-tg-secondary">
                    {e.platform === "youtube" ? <YoutubeIcon className="h-4 w-4 text-red-500" /> : <InstagramIcon className="h-4 w-4 text-fuchsia-500" />}
                  </span>
                  <span>{e.title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-tg-secondary">
                  <span>{formatJalaliDateTime(e.publishAtUtc)}</span>
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            ))}
          {events.length === 0 && <p className="p-6 text-center text-sm text-tg-secondary">هیچ محتوای زمان‌بندی‌شده‌ای وجود ندارد.</p>}
        </Card>
      )}
    </div>
  );
}
