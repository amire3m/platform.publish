"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/providers";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function GeneralSettingsPage() {
  const { data, mutate } = useSWR("/api/settings", fetcher);
  const { showToast } = useToast();
  const [fileSizeLimitMb, setFileSizeLimitMb] = useState(50);
  const [defaultTimezone, setDefaultTimezone] = useState("Asia/Tehran");

  useEffect(() => {
    if (data?.data) {
      setFileSizeLimitMb(data.data.fileSizeLimitMb ?? 50);
      setDefaultTimezone(data.data.defaultTimezone ?? "Asia/Tehran");
    }
  }, [data]);

  async function save() {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileSizeLimitMb, defaultTimezone }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("تنظیمات ذخیره شد.", "success");
    mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">تنظیمات عمومی</h1>
        <p className="text-sm text-tg-secondary">تنظیمات منطقه زمانی و محدودیت‌های سیستم</p>
      </div>

      <Card className="max-w-lg space-y-4">
        <div>
          <Label>منطقه زمانی پیش‌فرض</Label>
          <Input value={defaultTimezone} onChange={(e) => setDefaultTimezone(e.target.value)} />
          <p className="mt-1 text-xs text-tg-secondary/80">تمام محاسبات زمان‌بندی بر اساس این منطقه انجام و به‌صورت UTC ذخیره می‌شود.</p>
        </div>
        <div>
          <Label>محدودیت حجم فایل ربات تلگرام (مگابایت)</Label>
          <Input type="number" value={fileSizeLimitMb} onChange={(e) => setFileSizeLimitMb(Number(e.target.value))} />
          <p className="mt-1 text-xs text-tg-secondary/80">
            محدودیت پیش‌فرض Bot API معمولی ۵۰ مگابایت است. برای فایل‌های حجیم‌تر باید یک سرور محلی Bot API راه‌اندازی شود (به راهنمای پروژه مراجعه کنید).
          </p>
        </div>
        <Button onClick={save}>ذخیره تنظیمات</Button>
      </Card>
    </div>
  );
}
