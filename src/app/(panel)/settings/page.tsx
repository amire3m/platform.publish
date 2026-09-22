"use client";

import Link from "next/link";
import { Send, Settings as SettingsIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";

const ITEMS = [
  { href: "/settings/telegram", label: "تلگرام", desc: "گروه و تاپیک‌ها — مخزن اصلی", icon: Send, color: "text-sky-500" },
  { href: "/settings/youtube", label: "یوتیوب", desc: "OAuth و آنالیتیکس", icon: YoutubeIcon, color: "text-red-500" },
  { href: "/settings/instagram", label: "اینستاگرام", desc: "اتصال مرورگری ریلز", icon: InstagramIcon, color: "text-fuchsia-500" },
  { href: "/settings/general", label: "عمومی", desc: "منطقه زمانی و محدودیت فایل", icon: SettingsIcon, color: "text-slate-500" },
];

export default function SettingsHubPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-tg-text">تنظیمات</h1>
        <p className="text-sm text-tg-secondary">همه تنظیمات سامانه در یک بخش — برای جلوگیری از شلوغی تب‌ها</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((it) => {
          const Icon = it.icon as unknown as React.ComponentType<{ className?: string }>;
          return (
            <Link key={it.href} href={it.href}>
              <Card className="flex h-full flex-col gap-3 p-4 transition hover:border-tg-accent/30 hover:bg-tg-hover/40">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-tg-hover ${it.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-tg-text">{it.label}</p>
                  <p className="text-xs text-tg-secondary">{it.desc}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-tg-secondary/80">هر بخش همان صفحه قبلی است — آدرس مستقیم هم همچنان کار می‌کند.</p>
    </div>
  );
}
