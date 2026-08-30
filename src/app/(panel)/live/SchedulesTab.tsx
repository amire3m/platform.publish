"use client";
import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, CalendarClock, AlertTriangle } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/providers";
import { parseJsonResponse } from "@/lib/client/http";
import { liveFetcher } from "./LiveTab";

interface ScheduleRow {
  id: string;
  name: string;
  channelRef: string;
  channelName: string | null;
  playlistInput: string;
  quality: string;
  loop: boolean;
  overlayEnabled: boolean;
  startTehran: string;
  endTehran: string | null;
  daysOfWeek: number[];
  enabled: boolean;
  lastStartedAt: string | null;
  lastError: string | null;
}

interface ChannelPublic { id: string; name: string; isActive: boolean }

const DAY_LABELS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

function daysFa(days: number[]): string {
  if (days.length === 7) return "همه روزها";
  return days.map((d) => DAY_LABELS[d]).join("، ");
}

const emptyForm = {
  name: "", channelRef: "", playlistInput: "", quality: "720", loop: true, overlayEnabled: false,
  startTehran: "18:00", endTehran: "22:00", endEnabled: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] as number[],
};

export default function SchedulesTab() {
  const { showToast } = useToast();
  const { data, mutate } = useSWR<ScheduleRow[]>("/api/live/schedules", liveFetcher, { refreshInterval: 30000 });
  const { data: channels } = useSWR<ChannelPublic[]>("/api/live/channels", liveFetcher, { refreshInterval: 60000 });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function call(method: string, body?: Record<string, unknown>, query = "") {
    setBusy(true);
    try {
      const res = await fetch(`/api/live/schedules${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const resp = await parseJsonResponse<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !resp.ok) throw new Error(resp.error ?? "خطا");
      showToast("انجام شد.", "success");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleDay(d: number) {
    set("daysOfWeek", form.daysOfWeek.includes(d) ? form.daysOfWeek.filter((x) => x !== d) : [...form.daysOfWeek, d]);
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-tg-text">برنامه تکرارشونده جدید</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-tg-secondary">نام برنامه</label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً پخش عصرگاهی" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-tg-secondary">کانال مقصد</label>
            <Select value={form.channelRef} onChange={(e) => set("channelRef", e.target.value)} className="mt-1">
              <option value="">— انتخاب کانال —</option>
              {(channels ?? []).filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-tg-secondary">پلی‌لیست یوتیوب</label>
            <Input value={form.playlistInput} onChange={(e) => set("playlistInput", e.target.value)} placeholder="https://www.youtube.com/playlist?list=PL..." className="mt-1" dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-medium text-tg-secondary">ساعت شروع (تهران)</label>
            <Input type="time" value={form.startTehran} onChange={(e) => set("startTehran", e.target.value)} className="mt-1" dir="ltr" />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-tg-secondary">
              <input type="checkbox" checked={form.endEnabled} onChange={(e) => set("endEnabled", e.target.checked)} className="h-3.5 w-3.5" />
              ساعت پایان (خالی = تا پایان پلی‌لیست)
            </label>
            <Input type="time" value={form.endTehran} onChange={(e) => set("endTehran", e.target.value)} disabled={!form.endEnabled} className="mt-1" dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-medium text-tg-secondary">کیفیت</label>
            <Select value={form.quality} onChange={(e) => set("quality", e.target.value)} className="mt-1">
              <option value="720">720p — پیشنهادی</option>
              <option value="1080">1080p بدون انکود</option>
            </Select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-tg-text">
              <input type="checkbox" checked={form.loop} onChange={(e) => set("loop", e.target.checked)} className="h-4 w-4" />
              تکرار
            </label>
            <label className="flex items-center gap-2 text-sm text-tg-text">
              <input type="checkbox" checked={form.overlayEnabled} onChange={(e) => set("overlayEnabled", e.target.checked)} className="h-4 w-4" />
              لوگو
            </label>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-tg-secondary">روزهای هفته</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${form.daysOfWeek.includes(d) ? "bg-tg-accent/15 font-semibold text-tg-accent" : "bg-tg-hover text-tg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          onClick={async () => {
            await call("POST", {
              name: form.name,
              channelRef: form.channelRef,
              playlistInput: form.playlistInput,
              quality: form.quality,
              loop: form.loop,
              overlayEnabled: form.overlayEnabled,
              startTehran: form.startTehran,
              endTehran: form.endEnabled ? form.endTehran : null,
              daysOfWeek: [...form.daysOfWeek].sort((a, b) => a - b),
            });
            setForm(emptyForm);
          }}
          disabled={busy || !form.name.trim() || !form.channelRef || !form.playlistInput.trim() || form.daysOfWeek.length === 0}
          className="min-h-[40px]"
        >
          <Plus className="h-4 w-4" /> ذخیره برنامه
        </Button>
      </Card>

      <div className="space-y-2">
        {(data ?? []).map((s) => (
          <Card key={s.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-tg-text">
                  <CalendarClock className="ml-1 inline h-4 w-4 text-tg-accent" />
                  {s.name}
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] ${s.enabled ? "bg-emerald-500/15 text-emerald-700" : "bg-tg-hover text-tg-secondary"}`}>
                    {s.enabled ? "فعال" : "غیرفعال"}
                  </span>
                </p>
                <p className="text-[11px] text-tg-secondary">
                  {s.startTehran}{s.endTehran ? ` تا ${s.endTehran}` : ""} · {daysFa(s.daysOfWeek)} · {s.channelName ?? "کانال حذف‌شده"} · {s.quality}p
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => call("PATCH", { ...s, enabled: !s.enabled })} disabled={busy} className="min-h-[34px]">
                  {s.enabled ? "غیرفعال" : "فعال"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => call("DELETE", undefined, `?id=${s.id}`)} disabled={busy} className="min-h-[34px]">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {s.lastError && (
              <p className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" /> آخرین خطا: {s.lastError}
              </p>
            )}
          </Card>
        ))}
        {data && data.length === 0 && <Card><p className="py-6 text-center text-sm text-tg-secondary">هنوز برنامه‌ای ثبت نشده است.</p></Card>}
      </div>
    </div>
  );
}
