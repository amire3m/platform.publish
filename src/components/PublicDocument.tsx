import Link from "next/link";
import type { ReactNode } from "react";

export function PublicDocument({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fff7f7] text-slate-800">
      <header className="border-b border-rose-100 bg-white">
        <div className="mx-auto flex min-h-16 max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[#881337]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/emro-logo.svg" alt="" className="h-9 w-9 rounded-lg" />
            Publish Platform Emro
          </Link>
          <nav className="flex items-center gap-4 text-sm" aria-label="ناوبری اسناد عمومی">
            <Link href="/" className="text-slate-600 hover:text-[#881337]">صفحه اصلی</Link>
            <Link href="/privacy" className="text-slate-600 hover:text-[#881337]">حریم خصوصی</Link>
            <Link href="/terms" className="text-slate-600 hover:text-[#881337]">شرایط استفاده</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="border-b border-rose-100 pb-7">
          <p className="text-sm font-semibold text-rose-700">Publish Platform Emro</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{subtitle}</p>
        </div>
        <div className="mt-8 space-y-8 text-sm leading-8 text-slate-700">{children}</div>
      </article>

      <footer className="border-t border-rose-100 bg-white py-6 text-center text-xs text-slate-500">
        موسسه امام روح‌الله · <a className="text-[#881337] hover:underline" href="mailto:amirandali.teams@gmail.com">amirandali.teams@gmail.com</a>
      </footer>
    </main>
  );
}

export function DocumentSection({ title, children, dir = "rtl" }: { title: string; children: ReactNode; dir?: "rtl" | "ltr" }) {
  return (
    <section dir={dir}>
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
