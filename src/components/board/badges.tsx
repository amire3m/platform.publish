"use client";

export function DemoBadge({ label = "داده نمایشی" }: { label?: string }) {
  return (
    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
      {label}
    </span>
  );
}

export function MissingBadge({ label = "اطلاعات موجود نیست" }: { label?: string }) {
  return (
    <span className="rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[11px] text-slate-500">
      {label}
    </span>
  );
}

export function NeedsInput({ title = "نیازمند تکمیل اطلاعات", description }: { title?: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-tg-border bg-tg-hover/30 p-5 text-center">
      <p className="text-sm font-bold text-tg-text">{title}</p>
      {description && <p className="mt-1 text-xs leading-5 text-tg-secondary">{description}</p>}
    </div>
  );
}

export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fa-IR");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("fa-IR")}٪`;
}
