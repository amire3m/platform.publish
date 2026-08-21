import type { AccountSyncResult } from "@/lib/analytics/sync";

interface SyncResultPresentation {
  label: string;
  action: string;
  tone: "positive" | "negative" | "warning" | "neutral";
}

const codePresentation: Partial<Record<NonNullable<AccountSyncResult["code"]>, SyncResultPresentation>> = {
  RECONNECT_REQUIRED: {
    label: "اتصال دوباره لازم است",
    action: "اتصال حساب را از بخش کانال‌ها دوباره برقرار کنید.",
    tone: "negative",
  },
  API_NOT_ENABLED: {
    label: "سرویس آمار فعال نیست",
    action: "YouTube Analytics API را برای این حساب فعال کنید.",
    tone: "warning",
  },
  QUOTA_EXHAUSTED: {
    label: "سهمیه سرویس تمام شده",
    action: "پس از بازنشانی سهمیه دوباره تلاش کنید.",
    tone: "warning",
  },
  SYNC_IN_PROGRESS: {
    label: "همگام‌سازی در جریان است",
    action: "چند دقیقه دیگر وضعیت را دوباره بررسی کنید.",
    tone: "neutral",
  },
  ACCOUNT_NOT_SYNCABLE: {
    label: "حساب قابل همگام‌سازی نیست",
    action: "وضعیت اتصال و فعال‌بودن حساب را بررسی کنید.",
    tone: "warning",
  },
  SYNC_FAILED: {
    label: "ناموفق",
    action: "دوباره تلاش کنید؛ اگر خطا ادامه داشت وضعیت اتصال حساب را بررسی کنید.",
    tone: "negative",
  },
};

export function syncResultPresentation(
  result: Pick<AccountSyncResult, "status" | "code">,
): SyncResultPresentation {
  const coded = result.code ? codePresentation[result.code] : undefined;
  if (coded) return coded;
  if (result.status === "synced") {
    return { label: "همگام شد", action: "داده‌های تازه دریافت شد.", tone: "positive" };
  }
  if (result.status === "skipped") {
    return { label: "رد شد", action: "این حساب در این نوبت همگام نشد.", tone: "neutral" };
  }
  return codePresentation.SYNC_FAILED!;
}
