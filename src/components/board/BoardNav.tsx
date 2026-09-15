"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  return (
    <nav aria-label="بخش‌های گزارش پروژه" className="rounded-xl border border-tg-border bg-tg-surface p-1.5">
      <div className="flex flex-wrap gap-1">
        {ITEMS.map((t) => {
          const href = `/board/${t.id}`;
          const active = pathname === href;
          return (
            <Link
              key={t.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:flex-none sm:px-4 ${
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
