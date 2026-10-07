"use client";

import { useState } from "react";
import type { ContentPart } from "./types";
import { ACTIVITY_LABELS } from "./room-model";
import { PART_ACTIVITIES, REQUIRED_FOR_SEND } from "@/lib/content-room/activities";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { Send } from "lucide-react";

const ACTIVITY_ORDER = PART_ACTIVITIES;

function tickTitle(label: string, partNumber: number, meta: ContentPart["activityMeta"], activity: string, userNames?: Record<string, string>): string {
  const m = meta?.[activity];
  if (!m?.completedBy) return `${label} برای قسمت ${partNumber}`;
  const who = userNames?.[m.completedBy] ?? m.completedBy;
  const when = m.completedAt ? formatJalaliDateTime(m.completedAt) : "";
  return `${label} برای قسمت ${partNumber} — ثبت: ${who}${when ? ` · ${when}` : ""}`;
}

export function PartActivitiesGrid({
  parts,
  onToggle,
  onSendPart,
  userNames,
}: {
  parts: ContentPart[];
  onToggle: (partId: string, activity: string, isDone: boolean) => void;
  /** Optional: publish a single ready part right away (selective send). */
  onSendPart?: (partId: string, partNumber: number) => Promise<void> | void;
  /** userId → display name for audit tooltips. */
  userNames?: Record<string, string>;
}) {
  const activities = ACTIVITY_ORDER;
  const activeParts = parts.filter((p) => (p.isActive ?? true));
  const [sendingId, setSendingId] = useState<string | null>(null);

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
                            onChange={(e) => onToggle(p.id, a, e.target.checked)}
                            className="h-4 w-4 rounded border-tg-border text-tg-accent focus:ring-tg-accent disabled:opacity-40"
                            aria-label={title}
                            title={title}
                          />
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
        ردیف سبز = همه فعالیت‌های آن قسمت کامل است و دکمه «انتشار» فعال می‌شود — انتشار هر قسمت مستقل از بقیه است و نیازی به آماده‌بودن کل برنامه ندارد. تیک «قبلاً منتشر شده» سایر فعالیت‌های همان قسمت را غیرفعال می‌کند و در ارسال نادیده گرفته می‌شود. حرف کنار هر تیک = حرف اول نام ثبت‌کننده؛ نگه‌داشتن نشانگر جزئیات (نام و تاریخ ثبت) را نشان می‌دهد.
      </p>
    </div>
  );
}
