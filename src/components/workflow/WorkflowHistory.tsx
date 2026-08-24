"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, Select, Label } from "@/components/ui";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { auditActionLabelFa, entityTypeLabelFa, fieldLabelFa, platformLabelFa, sourceLabelFa, statusLabelFa, deliverableKindLabelFa, UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";

export interface WorkflowHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorLabel?: string | null;
  source?: string | null;
  reason?: string | null;
  createdAt: string | Date;
}

interface Props {
  entries: WorkflowHistoryEntry[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function safeJsonSummary(value: Record<string, unknown> | null | undefined): string {
  if (!value || typeof value !== "object") return "—";
  // Only expose business-safe keys; avoid secrets. Show a compact summary.
  const keys = Object.keys(value);
  if (keys.length === 0) return "—";
  const preview: string[] = [];
  for (const k of keys.slice(0, 4)) {
    const v = value[k];
    let str: string;
    if (v === null || v === undefined) str = "—";
    else if (typeof v === "boolean") str = v ? "بله" : "خیر";
    else if (typeof v === "number") str = String(v);
    else if (typeof v === "string" && (k === "status" || k.endsWith("Status"))) str = statusLabelFa(v);
    else if (typeof v === "string" && k === "platform") str = platformLabelFa(v);
    else if (typeof v === "string" && k === "kind") str = deliverableKindLabelFa(v);
    else if (typeof v === "string") str = v.length > 40 ? v.slice(0, 40) + "…" : v;
    else str = "جزئیات ثبت‌شده";
    preview.push(`${fieldLabelFa(k)}: ${str}`);
  }
  if (keys.length > 4) preview.push(`+${keys.length - 4} فیلد دیگر`);
  return preview.join(" | ");
}

export function WorkflowHistory({ entries, isLoading, error, onRetry }: Props) {
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.entityType);
    return Array.from(set);
  }, [entries]);

  const actors = useMemo(() => {
    const set = new Map<string, string>();
    for (const e of entries) {
      const id = e.actorUserId ?? "unknown";
      const label = e.actorName ?? e.actorLabel ?? UNKNOWN_LABEL_FA;
      if (!set.has(id)) set.set(id, label);
    }
    return Array.from(set.entries()).map(([id, label]) => ({ id, label }));
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (actorFilter !== "all" && (e.actorUserId ?? "unknown") !== actorFilter) return false;
      return true;
    });
  }, [entries, entityFilter, actorFilter]);

  if (isLoading) {
    return (
      <Card className="space-y-3">
        <div className="h-5 w-32 animate-pulse rounded bg-tg-hover" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-tg-hover/60" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <div dir="rtl">
        <Card className="space-y-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-4 py-2 text-sm font-medium text-tg-text hover:bg-tg-hover"
            >
              تلاش دوباره
            </button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-tg-text">تاریخچه تغییرات</h3>
        <span className="rounded-full bg-tg-hover px-2.5 py-1 text-xs font-medium text-tg-secondary">
          {filtered.length} رویداد
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>فیلتر موجودیت</Label>
          <Select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="mt-1 min-h-[44px]"
            aria-label="فیلتر بر اساس نوع موجودیت"
          >
            <option value="all">همه موجودیت‌ها</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {entityTypeLabelFa(t)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>فیلتر کنشگر</Label>
          <Select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="mt-1 min-h-[44px]"
            aria-label="فیلتر بر اساس کنشگر"
          >
            <option value="all">همه کنشگران</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="رویدادی یافت نشد" description="فیلترها را تغییر دهید یا تاریخچه این برنامه هنوز ثبت نشده است." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-tg-border bg-tg-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-tg-text">
                    <span className="inline-flex items-center rounded-full bg-tg-accent/10 px-2 py-0.5 text-xs font-medium text-tg-accent">
                      {auditActionLabelFa(entry.action)}
                    </span>
                    <span className="text-xs font-normal text-tg-secondary">
                      {entityTypeLabelFa(entry.entityType)} · {entry.entityId.slice(0, 8)}…
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-tg-secondary">
                    کنشگر:{" "}
                    <span className="font-medium text-tg-text">
                       {entry.actorName ?? entry.actorLabel ?? UNKNOWN_LABEL_FA}
                    </span>
                    {" · "}
                    منبع: <span className="font-medium text-tg-text">{entry.source ? sourceLabelFa(entry.source) : "—"}</span>
                  </p>
                </div>
                <time className="shrink-0 text-xs text-tg-secondary" dateTime={String(entry.createdAt)}>
                  {formatJalaliDateTime(entry.createdAt)}
                </time>
              </div>

              {(entry.before || entry.after) && (
                <div className="mt-3 grid gap-2 rounded-lg bg-tg-hover/40 p-3 text-xs leading-relaxed">
                  <div>
                    <span className="font-semibold text-tg-secondary">قبل: </span>
                    <span className="text-tg-text">{safeJsonSummary(entry.before as Record<string, unknown> | null)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-tg-secondary">بعد: </span>
                    <span className="text-tg-text">{safeJsonSummary(entry.after as Record<string, unknown> | null)}</span>
                  </div>
                </div>
              )}

              {entry.reason && (
                <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">دلیل: </span>
                  {entry.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      </Card>
    </div>
  );
}
