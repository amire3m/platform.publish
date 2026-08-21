"use client";

import useSWR from "swr";
import { Check, X } from "lucide-react";
import { Card, StatusBadge } from "@/components/ui";
import { DEFAULT_CAPABILITY_CONFIG } from "@/lib/capabilities";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function InstagramSettingsPage() {
  const { data } = useSWR("/api/settings", fetcher);
  const settings = data?.data;
  const igCaps = DEFAULT_CAPABILITY_CONFIG.instagram.contentTypes;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">تنظیمات اتصال اینستاگرام</h1>
        <p className="text-sm text-tg-secondary">فقط از طریق Instagram Graph API رسمی (حساب Business/Creator)</p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-semibold">وضعیت پیکربندی Meta App</p>
          <StatusBadge status={settings?.metaOauthConfigured ? "connected" : "disconnected"} />
        </div>
        <p className="mt-2 text-sm text-tg-text/75">
          برای اتصال رسمی، متغیرهای محیطی <code>META_APP_ID</code>، <code>META_APP_SECRET</code> و <code>META_REDIRECT_URI</code> را تنظیم کنید. حساب
          اینستاگرام باید Business/Creator باشد و به یک صفحه فیسبوک متصل باشد.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">جدول قابلیت‌ها بر اساس نوع محتوا</h2>
        <table className="w-full text-sm">
          <thead className="text-right text-xs text-tg-secondary">
            <tr>
              <th className="p-2">نوع محتوا</th>
              <th className="p-2">کپشن</th>
              <th className="p-2">Alt Text</th>
              <th className="p-2">کاور</th>
              <th className="p-2">اولین کامنت</th>
              <th className="p-2">موقعیت مکانی</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(igCaps).map(([key, cap]) => (
              <tr key={key} className="border-t border-tg-border">
                <td className="p-2 font-medium">{cap.label}</td>
                {["caption", "altText", "cover", "firstComment", "location"].map((field) => (
                  <td key={field} className="p-2 text-xs">
                    {cap.fields[field]?.supported ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <X className="h-3.5 w-3.5" />
                        {cap.fields[field]?.reason ?? "پشتیبانی نمی‌شود"}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-tg-secondary/80">
          استوری، موزیک، Collab و لینک قابل‌کلیک فعلاً از طریق Graph API عمومی پشتیبانی نمی‌شوند و در ویزارد آپلود نمایش داده نمی‌شوند.
        </p>
      </Card>
    </div>
  );
}
