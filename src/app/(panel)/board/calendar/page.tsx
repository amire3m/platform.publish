"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { useProduction } from "@/lib/board/production";
import { NeedsInput } from "@/components/board/badges";

const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function monthCells(year: number, month: number): Array<{ day: number; date: string } | null> {
  const first = new Date(Date.UTC(year, month, 1));
  const startDow = (first.getUTCDay() + 1) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    cells.push({ day: d, date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }
  return cells;
}

export default function BoardCalendarPage() {
  const { items } = useProduction();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const cells = useMemo(() => monthCells(ym.y, ym.m), [ym]);
  const byDate = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const p of items) {
      if (!p.etaDate) continue;
      const arr = map.get(p.etaDate) ?? [];
      arr.push(p);
      map.set(p.etaDate, arr);
    }
    return map;
  }, [items]);
  const upcoming = useMemo(
    () => items.filter((p) => p.etaDate && p.editStatus !== "published").sort((a, b) => a.etaDate.localeCompare(b.etaDate)).slice(0, 10),
    [items],
  );

  function shift(d: number) {
    setYm((v) => {
      const dt = new Date(Date.UTC(v.y, v.m + d, 1));
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() };
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">تقویم انتشار آینده</h2>
        <span className="mr-auto flex gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-tg-border px-3 py-1.5 text-xs text-tg-text" aria-label="ماه قبل">→</button>
          <button type="button" onClick={() => shift(1)} className="rounded-lg border border-tg-border px-3 py-1.5 text-xs text-tg-text" aria-label="ماه بعد">←</button>
        </span>
      </div>
      <Card>
        <p className="mb-3 text-center text-sm font-bold tabular-nums text-tg-text">
          {ym.y}/{String(ym.m + 1).padStart(2, "0")}
        </p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <p key={w} className="py-1 text-[11px] font-bold text-tg-secondary">{w}</p>
          ))}
          {cells.map((c, i) => (
            <div key={i} className="min-h-14 rounded-lg border border-tg-border/50 p-1">
              {c && (
                <>
                  <p className="text-[11px] tabular-nums text-tg-secondary">{c.day}</p>
                  {(byDate.get(c.date) ?? []).slice(0, 2).map((p) => (
                    <p key={p.id} className="truncate rounded bg-tg-accent/15 px-1 text-[10px] text-tg-text" title={p.project}>
                      {p.project}
                    </p>
                  ))}
                  {(byDate.get(c.date)?.length ?? 0) > 2 && <p className="text-[10px] text-tg-secondary">+{byDate.get(c.date)!.length - 2}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="space-y-2">
        <h3 className="font-bold text-tg-text">نزدیک‌ترین انتشارها</h3>
        {upcoming.length === 0 && <NeedsInput title="نیازمند تکمیل اطلاعات" description="برای نمایش تقویم، تاریخ انتشار پروژه‌ها را در صفحه تولید ثبت کنید." />}
        {upcoming.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg bg-tg-hover/40 px-3 py-2 text-xs">
            <span className="font-medium text-tg-text">{p.project}</span>
            <span className="text-tg-secondary">{p.channel}</span>
            <span className="mr-auto tabular-nums text-tg-secondary" dir="ltr">{p.etaDate}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
