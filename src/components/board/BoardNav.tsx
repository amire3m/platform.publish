"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ITEMS: Array<{ id: string; label: string }> = [
  { id: "overview", label: "نمای کلی پروژه" },
  { id: "channels", label: "معرفی کانال‌ها" },
  { id: "dashboard", label: "داشبورد آماری" },
  { id: "zaviyeno", label: "تحلیل زاویه نو" },
  { id: "production", label: "وضعیت تولید و تدوین" },
  { id: "archive", label: "آرشیو محتوا" },
  { id: "calendar", label: "تقویم انتشار" },
  { id: "future", label: "برنامه تولید آینده" },
  { id: "collabs", label: "همکاری بین‌کانالی" },
  { id: "licenses", label: "وضعیت مجوزها" },
  { id: "instagram", label: "گزارش اینستاگرام" },
  { id: "telegram", label: "اتصال به تلگرام" },
  { id: "meeting", label: "گزارش جلسه" },
  { id: "settings", label: "تنظیمات" },
];

export function BoardNav() {
  const [hash, setHash] = useState("overview");
  useEffect(() => {
    const update = () => setHash(window.location.hash.replace(/^#/, "") || "overview");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <nav aria-label="بخش‌های گزارش پروژه" className="sticky top-2 z-30 rounded-xl border border-tg-border bg-tg-surface p-1.5 shadow-sm">
      <div className="flex gap-1 overflow-x-auto p-0.5 sm:flex-wrap sm:overflow-visible">
        {ITEMS.map((t) => {
          const href = `/board#${t.id}`;
          const active = hash === t.id;
          return (
            <Link
              key={t.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-center text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:flex-none sm:px-4 ${
                active ? "bg-tg-accent text-tg-accent-fg shadow-sm" : "bg-transparent text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
