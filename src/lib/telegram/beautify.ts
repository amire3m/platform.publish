import { formatJalaliDateTime, toPersianDigits } from "@/lib/date/jalali";

// Reuses STATUS_LABELS from src/components/ui.tsx:70 — mirrored here for server-side use
// (ui.tsx is "use client" and not exported; values kept in sync with that file)
const LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  uploaded: "آپلودشده",
  in_review: "در بررسی",
  changes_requested: "نیازمند اصلاح",
  approved: "تأییدشده",
  scheduled: "زمان‌بندی‌شده",
  publishing: "در حال انتشار",
  published: "منتشرشده",
  failed: "ناموفق",
  archived: "آرشیوشده",
  rejected: "رد شده",
  cancelled: "لغوشده",
  pending: "در انتظار",
};

function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function platformList(platformTargets?: Array<{ platform: string }>): string {
  if (!platformTargets || platformTargets.length === 0) return "—";
  return platformTargets.map((t) => escapeHtml(String(t.platform))).join("، ");
}

export function beautifyContent(p: {
  id: string;
  title?: string | null;
  status: string;
  approvalStatus?: string | null;
  createdAt: string | Date;
  createdBy?: string | null;
  platformTargets?: Array<{ platform: string }>;
  description?: string | null;
}): { text: string; parseMode: "HTML" } {
  const status = statusLabel(p.status);
  const approval = p.approvalStatus ? ` | ✅ ${statusLabel(p.approvalStatus)}` : "";
  const title = escapeHtml(p.title || "بدون عنوان");
  const date = formatJalaliDateTime(p.createdAt);
  const author = escapeHtml(p.createdBy || "سیستم");
  const platforms = platformList(p.platformTargets);
  // Emoji map: 📥🎨✍️✅❌🧾📊⏳✏️🚀 — keep ✏️ for changes
  const text =
    `<b>📥 ${escapeHtml(status)} — ${title}</b>\n` +
    `🆔 <code>${escapeHtml(p.id)}</code> | 📅 ${escapeHtml(date)} | 👤 ${author}${approval}\n` +
    `🏷️ ${platforms}`;
  void toPersianDigits; // ensure helper is referenced per spec
  return { text, parseMode: "HTML" as const };
}

export function beautifyPublishSuccess(p: {
  content_id?: string;
  id?: string;
  title: string;
  targets?: unknown[];
}): { text: string; parseMode: "HTML" } {
  const cid = p.content_id ?? p.id ?? "—";
  const title = escapeHtml(p.title || "بدون عنوان");
  const date = formatJalaliDateTime(new Date().toISOString());
  const text = `<b>✅ منتشر شد — ${title}</b>\n🆔 <code>${escapeHtml(cid)}</code>\n📅 ${escapeHtml(date)}\n🚀 انتشار با موفقیت انجام شد.`;
  return { text, parseMode: "HTML" as const };
}

export function beautifyPublishError(p: {
  content_id?: string;
  id?: string;
  title: string;
  targets?: Array<{ lastError?: string; platform?: string }>;
  error?: string;
}): { text: string; parseMode: "HTML" } {
  const title = escapeHtml(p.title || "بدون عنوان");
  const err = escapeHtml(p.targets?.[0]?.lastError || p.error || "خطای نامشخص");
  const text = `<b>❌ خطا در انتشار — ${title}</b>\n⚠️ ${err}`;
  return { text, parseMode: "HTML" as const };
}

export function beautifyAudit(e: {
  action: string;
  entity_type: string;
  entity_id: string;
  from?: string | null;
  to?: string | null;
}): { text: string; parseMode: "HTML" } {
  const fromLabel = e.from ? statusLabel(e.from) : "—";
  const toLabel = e.to ? statusLabel(e.to) : "—";
  const action = escapeHtml(e.action);
  const entityType = escapeHtml(e.entity_type);
  const entityId = escapeHtml(e.entity_id);
  const text = `<b>🧾 لاگ:</b> ${action} — ${entityType} <code>${entityId}</code>\nاز ${escapeHtml(fromLabel)} به ${escapeHtml(toLabel)}`;
  return { text, parseMode: "HTML" as const };
}

export function beautifyAnalytics(snapshot: {
  platform: string;
  dateJalali?: string;
  dateUtc?: string | Date;
  metrics?: Record<string, number>;
  followersOrSubscribers?: number;
  views?: number;
}): { text: string; parseMode: "HTML" } {
  const platform = escapeHtml(snapshot.platform);
  const date = snapshot.dateJalali
    ? escapeHtml(snapshot.dateJalali)
    : snapshot.dateUtc
      ? escapeHtml(formatJalaliDateTime(snapshot.dateUtc))
      : "—";
  const views = snapshot.metrics?.views ?? snapshot.views ?? 0;
  const viewsFa = toPersianDigits(String(views));
  const text = `<b>📊 گزارش آنالیتیکس — ${platform}</b>\n📅 ${date}\n👁️ بازدید: ${viewsFa}`;
  return { text, parseMode: "HTML" as const };
}

export function beautifyImport(batch: {
  count?: number;
  imported?: number;
  total?: number;
}): { text: string; parseMode: "HTML" } {
  const n = batch.imported ?? batch.count ?? batch.total ?? 0;
  const nFa = toPersianDigits(String(n));
  const text = `<b>📥 ورود داده — ${nFa} رکورد</b>\n⏳ پردازش با موفقیت انجام شد.`;
  return { text, parseMode: "HTML" as const };
}
