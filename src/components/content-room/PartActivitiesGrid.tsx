"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ContentPart } from "./types";
import { ACTIVITY_LABELS } from "./room-model";
import { PART_ACTIVITIES, REQUIRED_FOR_SEND } from "@/lib/content-room/activities";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { fetchContentRoomApi } from "@/lib/content-room/client";
import { Button, Modal } from "@/components/ui";
import { History, MessageSquare, Send } from "lucide-react";

const ACTIVITY_ORDER = PART_ACTIVITIES;

function tickTitle(label: string, partNumber: number, meta: ContentPart["activityMeta"], activity: string, userNames?: Record<string, string>): string {
  const m = meta?.[activity];
  if (!m?.completedBy) return `${label} برای قسمت ${partNumber}`;
  const who = userNames?.[m.completedBy] ?? m.completedBy;
  const when = m.completedAt ? formatJalaliDateTime(m.completedAt) : "";
  const note = m.note ? ` — گزارش: ${m.note}` : "";
  return `${label} برای قسمت ${partNumber} — ثبت: ${who}${when ? ` · ${when}` : ""}${note}`;
}

interface HistoryItem {
  id: string;
  activity: string | null;
  isDone: boolean | null;
  note: string | null;
  actorName: string | null;
  createdAt: string | null;
}

function PartHistory({ partId, partNumber, userNames }: { partId: string; partNumber: number; userNames?: Record<string, string> }) {
  const { data, isLoading } = useSWR<{ history: HistoryItem[] }>(
    `/api/content-room/parts/${partId}/history`,
    fetchContentRoomApi<{ history: HistoryItem[] }>,
  );
  const rows = data?.history ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-tg-secondary">تاریخچه تیک‌های قسمت {partNumber} (جدیدترین اول)</p>
      {isLoading && <p className="text-sm text-tg-secondary">در حال بارگذاری…</p>}
      {!isLoading && rows.length === 0 && <p className="text-sm text-tg-secondary">هنوز فعالیتی ثبت نشده است.</p>}
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {rows.map((h) => (
          <li key={h.id} className="rounded-lg border border-tg-border p-2 text-xs">
            <p className="font-semibold text-tg-text">
              {h.isDone ? "تیک خورد" : "تیک برداشته شد"}: {ACTIVITY_LABELS[h.activity ?? ""] ?? h.activity}
            </p>
            <p className="text-tg-secondary">
              {h.actorName ?? "—"}
              {h.createdAt ? ` · ${formatJalaliDateTime(h.createdAt)}` : ""}
            </p>
            {h.note && <p className="mt-1 text-tg-text">گزارش: {h.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PartActivitiesGrid({
  parts,
  onToggle,
  onSendPart,
  userNames,
}: {
  parts: ContentPart[];
  onToggle: (partId: string, activity: string, isDone: boolean, note?: string | null) => void;
  /** Optional: publish a single ready part right away (selective send). */
  onSendPart?: (partId: string, partNumber: number) => Promise<void> | void;
  /** userId → display name for audit tooltips. */
  userNames?: Record<string, string>;
}) {
  const activities = ACTIVITY_ORDER;
  const activeParts = parts.filter((p) => (p.isActive ?? true));
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ partId: string; activity: string; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [historyPart, setHistoryPart] = useState<{ id: string; partNumber: number } | null>(null);

  function confirmPending() {
    if (!pending) return;
    onToggle(pending.partId, pending.activity, true, note.trim() || null);
    setPending(null);
    setNote("");
  }

  function isPartReady(p: ContentPart): boolean {
    const acts = p.activities ?? {};
    return REQUIRED_FOR_SEND.every((a) => Boolean(acts[a]));
  }

  async function handleSendPart(p: ContentPart) {
    if (!onSendPart) return;
    setSendingId(p.id);
    try {
      await onSendPart(p.id, p.partNumber);
    } finally {
      setSendingId(null);
    }
  }

  if (activeParts.length === 0) {
    return <p className="text-sm text-tg-secondary">قسمتی فعال یافت نشد.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-tg-border">
      <table className="w-full min-w-[780px] text-sm" dir="rtl">
        <thead className="bg-tg-hover/40 text-xs text-tg-secondary">
          <tr>
            <th className="px-3 py-2 text-right font-semibold">قسمت</th>
            <th className="px-2 py-2 text-center font-semibold">سابقه</th>
            {activities.map((a) => (
              <th
                key={a}
                className={`px-2 py-2 text-center font-semibold ${a === "previously_published" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""}`}
              >
                {ACTIVITY_LABELS[a] ?? a}
              </th>
            ))}
            <th className="px-2 py-2 text-center font-semibold">انتشار</th>
          </tr>
        </thead>
        <tbody>
          {[...activeParts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => {
              const isPreviouslyPublished = Boolean(p.activities?.previously_published);
              const ready = isPartReady(p);
              return (
                <tr key={p.id} className={`border-t border-tg-border hover:bg-tg-hover/30 ${ready ? "bg-emerald-500/5" : ""}`}>
                  <td className="px-3 py-2 font-medium text-tg-text">قسمت {p.partNumber}</td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setHistoryPart({ id: p.id, partNumber: p.partNumber })}
                      title={`سابقه تیک‌های قسمت ${p.partNumber}`}
                      aria-label={`سابقه تیک‌های قسمت ${p.partNumber}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  {activities.map((a) => {
                    const checked = Boolean(p.activities?.[a]);
                    const disabled = a !== "previously_published" && isPreviouslyPublished;
                    const label = ACTIVITY_LABELS[a] ?? a;
                    const meta = p.activityMeta?.[a];
                    const byName = meta?.completedBy ? (userNames?.[meta.completedBy] ?? meta.completedBy) : null;
                    const title = disabled
                      ? "این قسمت قبلاً منتشر شده است؛ سایر فعالیت‌ها غیرفعال است."
                      : tickTitle(label, p.partNumber, p.activityMeta, a, userNames);
                    return (
                      <td key={a} className={`px-2 py-2 text-center ${a === "previously_published" ? "bg-amber-500/5" : ""}`}>
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPending({ partId: p.id, activity: a, label });
                                setNote("");
                              } else {
                                onToggle(p.id, a, false);
                              }
                            }}
                            className="h-4 w-4 rounded border-tg-border text-tg-accent focus:ring-tg-accent disabled:opacity-40"
                            aria-label={title}
                            title={title}
                          />
                          {checked && meta?.note && (
                            <span title={`گزارش: ${meta.note}`} className="inline-flex h-4 w-4 items-center justify-center text-tg-accent">
                              <MessageSquare className="h-3 w-3" />
                            </span>
                          )}
                          {checked && byName && (
                            <span
                              title={title}
                              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tg-accent-soft px-1 text-[9px] font-bold text-tg-accent"
                            >
                              {byName.trim().charAt(0)}
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center">
                    {isPreviouslyPublished ? (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400">منتشر شده</span>
                    ) : onSendPart ? (
                      <button
                        onClick={() => handleSendPart(p)}
                        disabled={!ready || sendingId === p.id}
                        title={ready ? "انتشار فقط این قسمت در اتاق انتشار" : "برای انتشار، همه فعالیت‌های این قسمت باید کامل شود"}
                        className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors ${
                          ready
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                            : "border-tg-border text-tg-secondary opacity-50"
                        }`}
                      >
                        <Send className="h-3 w-3" />
                        {sendingId === p.id ? "…" : "انتشار"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-tg-secondary">
        ردیف سبز = همه فعالیت‌های آن قسمت کامل است و دکمه «انتشار» فعال می‌شود — انتشار هر قسمت مستقل از بقیه است و نیازی به آماده‌بودن کل برنامه ندارد. تیک «قبلاً منتشر شده» سایر فعالیت‌های همان قسمت را غیرفعال می‌کند و در ارسال نادیده گرفته می‌شود. حرف کنار هر تیک = حرف اول نام ثبت‌کننده؛ نگه‌داشتن نشانگر جزئیات (نام، تاریخ و گزارش) را نشان می‌دهد.
      </p>

      <Modal open={!!pending} onClose={() => setPending(null)} title={pending ? `ثبت «${pending.label}»` : ""}>
        <div className="space-y-3">
          <p className="text-xs text-tg-secondary">می‌توانید گزارش کوتاهی از کاری که انجام شد بنویسید (اختیاری — در سابقه قسمت می‌ماند).</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="مثلاً: نسخه هندبریک با پریست کانال ساخته و لینک شد"
            className="w-full rounded-lg border border-tg-border bg-transparent p-2 text-sm text-tg-text"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={confirmPending}>
              ثبت تیک
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>
              انصراف
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!historyPart} onClose={() => setHistoryPart(null)} title={historyPart ? `سابقه قسمت ${historyPart.partNumber}` : ""}>
        {historyPart && <PartHistory partId={historyPart.id} partNumber={historyPart.partNumber} userNames={userNames} />}
      </Modal>
    </div>
  );
}
