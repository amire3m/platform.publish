"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { DemoBadge, NeedsInput } from "@/components/board/badges";

const KEY = "board-report:telegram:v1";

interface TgPrefs {
  dailyDigest: boolean;
  weeklyReport: boolean;
  productionAlerts: boolean;
}

const DEFAULTS: TgPrefs = { dailyDigest: false, weeklyReport: false, productionAlerts: true };

const SAMPLE: Array<{ text: string; time: string }> = [
  { text: "گزارش روزانه عملکرد کانال‌ها", time: "هر روز ۸ صبح" },
  { text: "یادآور انتشارهای نزدیک (۳ روز آینده)", time: "خودکار" },
  { text: "هشدار عقب‌ماندگی تولید از برنامه", time: "خودکار" },
];

export default function BoardTelegramPage() {
  const [prefs, setPrefs] = useState<TgPrefs>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<TgPrefs>) });
    } catch {}
  }, []);

  function toggle(k: keyof TgPrefs) {
    setPrefs((p) => {
      const next = { ...p, [k]: !p[k] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const items: Array<{ key: keyof TgPrefs; label: string; desc: string }> = [
    { key: "dailyDigest", label: "خلاصه روزانه در تلگرام", desc: "بازدید، مشترک و بهترین ویدیوی هر کانال — هر روز صبح" },
    { key: "weeklyReport", label: "گزارش هفتگی", desc: "جمع‌بندی عملکرد هفته + نمودار رشد" },
    { key: "productionAlerts", label: "هشدارهای تولید", desc: "نزدیک‌شدن مهلت انتشار و تغییر وضعیت پروژه‌ها" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">اعلان‌ها و ربات تلگرام</h2>
        <DemoBadge label="پیش‌نمایش" />
      </div>
      <p className="max-w-3xl text-sm leading-6 text-tg-secondary">
        اتصال واقعی ربات (توکن و شناسه‌ها) در متغیرهای محیطی سرور تنظیم می‌شود و اینجا فقط پیش‌نمایش رفتار اعلان‌هاست.
      </p>

      <Card className="space-y-3">
        <h3 className="font-bold text-tg-text">تنظیمات اعلان</h3>
        {items.map((it) => (
          <label key={it.key} className="flex cursor-pointer items-start gap-3 rounded-lg bg-tg-hover/40 px-3 py-2.5">
            <input
              type="checkbox"
              checked={prefs[it.key]}
              onChange={() => toggle(it.key)}
              className="mt-1 h-4 w-4 accent-teal-600"
            />
            <span>
              <span className="block text-sm font-medium text-tg-text">{it.label}</span>
              <span className="block text-xs text-tg-secondary">{it.desc}</span>
            </span>
          </label>
        ))}
      </Card>

      <Card className="space-y-2">
        <h3 className="font-bold text-tg-text">نمونه اعلان‌ها</h3>
        {SAMPLE.map((s) => (
          <div key={s.text} className="flex items-center gap-2 rounded-lg bg-tg-hover/40 px-3 py-2 text-xs">
            <span className="text-tg-text">{s.text}</span>
            <span className="mr-auto text-tg-secondary">{s.time}</span>
          </div>
        ))}
        <NeedsInput title="نیازمند اتصال واقعی" description="برای ارسال واقعی، توکن ربات را در تنظیمات سرور ثبت کنید." />
      </Card>
    </div>
  );
}
