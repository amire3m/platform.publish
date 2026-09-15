import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BoardNav } from "@/components/board/BoardNav";

export const metadata: Metadata = {
  title: "گزارش جامع پروژه توسعه کانال‌های یوتیوب",
};

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-5" dir="rtl">
      <header>
        <h1 className="text-balance text-xl font-bold text-tg-text">گزارش جامع پروژه توسعه کانال‌های یوتیوب مؤسسه امام روح‌الله</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm leading-6 text-tg-secondary">
          تولید، تدوین، انتشار، آرشیو، پایش و توسعه محتوای ویدیویی در بستر یوتیوب و شبکه‌های اجتماعی
        </p>
      </header>
      <BoardNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
