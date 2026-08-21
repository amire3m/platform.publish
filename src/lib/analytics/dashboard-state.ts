export type DashboardRenderState = "loading" | "unavailable" | "ready";

export function getDashboardRenderState(input: {
  hasOverview: boolean;
  hasError: boolean;
  isLoading: boolean;
}): DashboardRenderState {
  if (input.hasError) return "unavailable";
  if (input.hasOverview) return "ready";
  return "loading";
}

export function getSyncRecoveryState(
  accounts: readonly {
    lastErrorCode: string | null;
    nextAttemptAt: Date | string | null;
  }[],
  now: Date,
): { message: string | null; retryDisabled: boolean } {
  const quota = accounts.find((account) => account.lastErrorCode === "QUOTA_EXHAUSTED");
  if (quota) {
    const retryAt = quota.nextAttemptAt ? new Date(quota.nextAttemptAt) : null;
    return {
      message: "سهمیه تمام شده است؛ زمان نمایش‌داده‌شده، برآورد محافظه‌کارانه تلاش بعدی است.",
      retryDisabled: Boolean(retryAt && Number.isFinite(retryAt.getTime()) && retryAt > now),
    };
  }
  if (accounts.some((account) => account.lastErrorCode === "RECONNECT_REQUIRED")) {
    return { message: "اتصال حساب یوتیوب را دوباره برقرار کنید.", retryDisabled: false };
  }
  if (accounts.some((account) => account.lastErrorCode === "API_NOT_ENABLED")) {
    return { message: "YouTube Analytics API را در پروژه Google فعال کنید.", retryDisabled: false };
  }
  return { message: null, retryDisabled: false };
}
