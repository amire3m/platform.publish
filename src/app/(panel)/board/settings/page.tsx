"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useBoardDataset, downloadJson } from "@/lib/board/store";
import { fmt } from "@/components/board/badges";

const KEYS = [
  "board-report:dataset:v1",
  "board-report:production:v1",
  "board-report:ideas:v1",
  "board-report:collabs:v1",
  "board-report:licenses:v1",
  "board-report:instagram:v1",
  "board-report:telegram:v1",
  "board-report:ui:v1",
];

export default function BoardSettingsPage() {
  const { dataset, resetDemo } = useBoardDataset();
  const [cleared, setCleared] = useState(false);

  function clearAll() {
    if (!window.confirm("همه داده‌های ذخیره‌شده بخش گزارش (CSV، تولید، ایده‌ها و...) پاک شود؟")) return;
    for (const k of KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }
    setCleared(true);
    window.location.reload();
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-tg-text">تنظیمات گزارش</h2>
      <p className="max-w-3xl rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        این بخش آزمایشی و موقت است و برای ارائه داخلی طراحی شده؛ داده‌ها فعلاً فقط در مرورگر شما (localStorage) ذخیره می‌شوند.
      </p>

      <Card className="space-y-3">
        <h3 className="font-bold text-tg-text">مدیریت دیتاست</h3>
        <p className="text-sm text-tg-secondary">
          منبع فعلی: {dataset.source === "csv" ? "فایل CSV بارگذاری‌شده" : "داده نمایشی"} · {fmt(dataset.rows.length)} ردیف
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => downloadJson("board-dataset.json", dataset)} className="min-h-[40px]">
            خروجی JSON دیتاست
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { resetDemo(); setCleared(false); }} className="min-h-[40px]">
            بازگشت به داده نمایشی
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 border-rose-300/50">
        <h3 className="font-bold text-rose-700 dark:text-rose-300">ناحیه خطر</h3>
        <p className="text-sm text-tg-secondary">پاک‌سازی همه داده‌های ذخیره‌شده این بخش در این مرورگر.</p>
        <Button size="sm" variant="secondary" onClick={clearAll} className="min-h-[40px] border-rose-300 text-rose-700">
          پاک‌سازی همه داده‌ها
        </Button>
        {cleared && <p className="text-xs text-tg-secondary">در حال بارگذاری مجدد...</p>}
      </Card>

      <Card className="space-y-2">
        <h3 className="font-bold text-tg-text">آستانه‌های مانیتایز یوتیوب</h3>
        <p className="text-sm tabular-nums text-tg-text">۱٬۰۰۰ مشترک + ۴٬۰۰۰ ساعت تماشا در ۱۲ ماه</p>
        <p className="text-[11px] text-tg-secondary">این آستانه‌ها ثابت یوتیوب‌اند و از تنظیمات تغییر نمی‌کنند.</p>
      </Card>
    </div>
  );
}
