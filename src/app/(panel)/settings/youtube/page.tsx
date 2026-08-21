"use client";

import useSWR from "swr";
import { Card, StatusBadge } from "@/components/ui";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function YoutubeSettingsPage() {
  const { data } = useSWR("/api/settings", fetcher);
  const settings = data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">تنظیمات اتصال یوتیوب</h1>
        <p className="text-sm text-tg-secondary">YouTube Data API v3 و YouTube Analytics API</p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-semibold">وضعیت پیکربندی OAuth</p>
          <StatusBadge status={settings?.googleOauthConfigured ? "connected" : "disconnected"} />
        </div>
        <p className="mt-2 text-sm text-tg-text/75">
          برای اتصال رسمی، متغیرهای محیطی <code>GOOGLE_CLIENT_ID</code>، <code>GOOGLE_CLIENT_SECRET</code> و <code>GOOGLE_REDIRECT_URI</code> را
          طبق راهنمای README تنظیم کنید. بدون این مقادیر، اتصال حساب‌های یوتیوب فقط در «حالت آزمایشی» ممکن است.
        </p>
        <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-tg-secondary">
          <li>Quota روزانه API باید در Google Cloud Console پایش شود.</li>
          <li>Refresh Token به‌صورت رمزنگاری‌شده در پایگاه‌داده محلی نگهداری می‌شود و هرگز به تلگرام یا مرورگر ارسال نمی‌شود.</li>
          <li>محدودیت سنی (Age Restriction) از طریق API عمومی یوتیوب پشتیبانی نمی‌شود و در ویزارد آپلود غیرفعال است.</li>
        </ul>
      </Card>

      <Card>
        <p className="text-sm text-tg-secondary">
          برای اتصال یک کانال جدید به صفحه «کانال‌ها و پیج‌ها» بروید و گزینه «اتصال رسمی OAuth» را انتخاب کنید.
        </p>
      </Card>
    </div>
  );
}
