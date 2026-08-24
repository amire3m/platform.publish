import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Eye,
  Heart,
  Send,
  ThumbsUp,
  Users,
} from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { db } from "@/db";
import { socialAccounts, analyticsSnapshots, content } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { MAIN_REPORT_ALIAS, MAIN_REPORT_ORGANIZATION } from "@/lib/accounts/organization";
import {
  todayJalali,
  buildJalaliMonthGrid,
  JALALI_MONTH_LABELS,
  JALALI_WEEKDAY_LABELS,
  utcToJalaliParts,
  toPersianDigits,
  formatJalaliDateOnly,
} from "@/lib/date/jalali";

export const dynamic = "force-dynamic";

interface AccountRow {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profileImage: string | null;
  connectionStatus: string;
}

interface SnapshotRow {
  accountId: string;
  followersOrSubscribers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagementRate: string | null;
}

interface ContentRow {
  id: string;
  title: string;
  status: string;
  scheduledAtUtc: Date | string | null;
  platformTargets: { platform: string; account_id: string; status: string }[];
}

function persianNumber(n: number | null | undefined): string {
  return toPersianDigits((n ?? 0).toLocaleString("en-US"));
}

export default async function ShowcasePage() {
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(and(
      eq(socialAccounts.active, true),
      eq(socialAccounts.connectionStatus, "connected"),
      eq(socialAccounts.organization, MAIN_REPORT_ORGANIZATION),
    ))
    .orderBy(socialAccounts.platform);
  const accountIds = accounts.map((account) => account.id);
  const accountIdSet = new Set(accountIds);
  const [snapshots, upcomingCandidates] = await Promise.all([
    accountIds.length > 0
      ? db.select().from(analyticsSnapshots).where(inArray(analyticsSnapshots.accountId, accountIds)).orderBy(analyticsSnapshots.createdAt)
      : Promise.resolve([]),
    db
      .select()
      .from(content)
      .where(and(eq(content.status, "scheduled"), gte(content.scheduledAtUtc, new Date())))
      .orderBy(content.scheduledAtUtc)
      .limit(40),
  ]);
  const upcoming = upcomingCandidates.filter((item) =>
    item.platformTargets.some((target) => {
      const accountId = target.account_id;
      return typeof accountId === "string" && accountIdSet.has(accountId);
    }),
  );

  const latestSnapshotByAccount = new Map<string, SnapshotRow>();
  for (const s of snapshots as unknown as SnapshotRow[]) {
    latestSnapshotByAccount.set(s.accountId, s);
  }

  const today = todayJalali();
  const grid = buildJalaliMonthGrid(today.jy, today.jm);
  const eventsByDay = new Map<number, ContentRow[]>();
  for (const c of upcoming as unknown as ContentRow[]) {
    if (!c.scheduledAtUtc) continue;
    const p = utcToJalaliParts(c.scheduledAtUtc);
    if (p.jy !== today.jy || p.jm !== today.jm) continue;
    const list = eventsByDay.get(p.jd) ?? [];
    list.push(c);
    eventsByDay.set(p.jd, list);
  }

  const totalSubs = accounts.reduce(
    (sum, a) => sum + (latestSnapshotByAccount.get(a.id)?.followersOrSubscribers ?? 0),
    0,
  );
  const totalViews = accounts.reduce((sum, a) => sum + (latestSnapshotByAccount.get(a.id)?.views ?? 0), 0);
  const totalLikes = accounts.reduce((sum, a) => sum + (latestSnapshotByAccount.get(a.id)?.likes ?? 0), 0);
  const publicProfiles = (["youtube", "instagram"] as const).flatMap((platform) => {
    const platformAccounts = accounts.filter((account) => account.platform === platform);
    if (platformAccounts.length === 0) return [];
    return [{
      id: platform,
      platform,
      followers: platformAccounts.reduce(
        (sum, account) => sum + (latestSnapshotByAccount.get(account.id)?.followersOrSubscribers ?? 0),
        0,
      ),
    }];
  });

  return (
    <main className="min-h-screen bg-[#FFF1F2] font-sans text-[#881337]">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-[#FECDD3] bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E11D48] text-white">
              <Send className="h-5 w-5 -scale-x-100" />
            </span>
            <span className="text-sm font-bold text-[#881337]">Publish Platform Emro</span>
          </div>
          <nav className="flex items-center gap-3" aria-label="ناوبری عمومی">
            <Link href="/privacy" className="hidden text-xs font-semibold text-[#881337]/70 hover:text-[#881337] sm:inline">حریم خصوصی</Link>
            <Link href="/terms" className="hidden text-xs font-semibold text-[#881337]/70 hover:text-[#881337] sm:inline">شرایط استفاده</Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              ورود به پنل
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#E11D48 1px, transparent 1px), linear-gradient(90deg, #E11D48 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#E11D48] ring-1 ring-[#FECDD3]">
              <BarChart3 className="h-3.5 w-3.5" />
              سامانه رسمی موسسه امام روح‌الله
            </span>
            <h1 className="mt-5 text-4xl font-black leading-tight text-[#881337] sm:text-5xl">
              مدیریت انتشار
              <span className="text-[#E11D48]"> یوتیوب و اینستاگرام</span>
            </h1>
            <p className="mt-4 text-base leading-7 text-[#881337]/70 sm:text-lg">
              {MAIN_REPORT_ALIAS} ابزار داخلی موسسه امام روح‌الله برای مدیریت دسترسی، زمان‌بندی،
              انتشار و مشاهده آمار محتوای YouTube و Instagram است.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-[#E11D48] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#E11D48]/25 transition hover:bg-[#be123c]"
              >
                ورود و مدیریت انتشار
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <a
                href="#calendar"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#881337] ring-1 ring-[#FECDD3] transition hover:bg-[#FFF1F2]"
              >
                <CalendarDays className="h-4 w-4" />
                مشاهده تقویم
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Channels ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#881337]">کانالها و پیجها</h2>
            <p className="mt-1 text-sm text-[#881337]/60">حسابهای متصل به پلتفرم</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#E11D48] ring-1 ring-[#FECDD3]">
             {toPersianDigits(publicProfiles.length)} پلتفرم
          </span>
        </div>

        {publicProfiles.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-[#FECDD3] bg-white/60 p-10 text-center text-sm text-[#881337]/60">
            هنوز حسابی متصل نشده است.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicProfiles.map((profile) => {
              const isYt = profile.platform === "youtube";
              return (
                <div
                  key={profile.id}
                  className="group rounded-2xl border border-[#FECDD3] bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-[#E11D48]/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF1F2]">
                      {isYt ? (
                        <YoutubeIcon className="h-6 w-6 text-[#E11D48]" />
                      ) : (
                        <InstagramIcon className="h-6 w-6 text-[#E11D48]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[#881337]">{MAIN_REPORT_ALIAS}</p>
                      <p className="truncate text-xs text-[#881337]/50">{isYt ? "YouTube" : "Instagram"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[#FECDD3] pt-3 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#881337]">
                      {isYt ? <Users className="h-4 w-4 text-[#2563EB]" /> : <Users className="h-4 w-4 text-[#2563EB]" />}
                      {isYt ? "مشترک" : "دنبالکننده"}:
                    </span>
                    <span className="font-black tabular-nums text-[#E11D48]">
                       {persianNumber(profile.followers)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- Calendar ---------- */}
      <section id="calendar" className="bg-white py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#881337]">تقویم انتشار</h2>
              <p className="mt-1 text-sm text-[#881337]/60">
                {JALALI_MONTH_LABELS[today.jm - 1]} {toPersianDigits(today.jy)}
              </p>
            </div>
            <span className="rounded-full bg-[#FFF1F2] px-3 py-1 text-xs font-bold text-[#E11D48] ring-1 ring-[#FECDD3]">
              {toPersianDigits(upcoming.length)} انتشار پیشرو
            </span>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-[#881337]/50 sm:gap-2">
            {JALALI_WEEKDAY_LABELS.map((d) => (
              <div key={d} className="pb-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {grid.map((cell, idx) => {
              const dayEvents = eventsByDay.get(cell.jd) ?? [];
              const inMonth = cell.inMonth;
              return (
                <div
                  key={idx}
                  className={`min-h-[72px] rounded-xl border p-1.5 text-right transition sm:min-h-[92px] ${
                    inMonth
                      ? "border-[#FECDD3] bg-[#FFF1F2]"
                      : "border-transparent bg-[#F8FAFC] text-[#881337]/30"
                  } ${dayEvents.length ? "ring-2 ring-[#E11D48]/40" : ""}`}
                >
                  <p className={`text-[11px] font-semibold ${inMonth ? "text-[#881337]" : ""}`}>
                    {toPersianDigits(cell.jd)}
                  </p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="truncate rounded-md bg-[#E11D48] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        title={c.title}
                      >
                        {c.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-[#881337]/50">
                        +{toPersianDigits(dayEvents.length - 3)} مورد
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {upcoming.length > 0 && (
            <div className="mt-6 rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] p-5">
              <h3 className="mb-3 text-sm font-bold text-[#881337]">انتشارهای پیشرو</h3>
              <ul className="space-y-2">
                {upcoming.slice(0, 10).map((c) => {
                  const p = c.scheduledAtUtc ? utcToJalaliParts(c.scheduledAtUtc) : null;
                  const isYt = (c.platformTargets?.[0]?.platform as string) === "youtube";
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2.5 text-sm"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-[#881337]">
                        {isYt ? (
                          <YoutubeIcon className="h-4 w-4 shrink-0 text-[#E11D48]" />
                        ) : (
                          <InstagramIcon className="h-4 w-4 shrink-0 text-[#E11D48]" />
                        )}
                        <span className="truncate">{c.title || "(بدون عنوان)"}</span>
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-[#881337]/60">
                        {p && c.scheduledAtUtc ? formatJalaliDateOnly(c.scheduledAtUtc) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Analytics ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-black text-[#881337]">آنالیز کانالها</h2>
        <p className="mt-1 text-sm text-[#881337]/60">آمار واقعی از آخرین اسنپشاتها</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#FECDD3] bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#881337]/60">
              <Users className="h-4 w-4 text-[#E11D48]" />
              مجموع دنبالکننده / مشترک
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums text-[#881337]">{persianNumber(totalSubs)}</p>
          </div>
          <div className="rounded-2xl border border-[#FECDD3] bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#881337]/60">
              <Eye className="h-4 w-4 text-[#2563EB]" />
              مجموع بازدید
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums text-[#881337]">{persianNumber(totalViews)}</p>
          </div>
          <div className="rounded-2xl border border-[#FECDD3] bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#881337]/60">
              <ThumbsUp className="h-4 w-4 text-[#2563EB]" />
              مجموع لایک
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums text-[#881337]">{persianNumber(totalLikes)}</p>
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[#881337] px-6 py-12 text-center sm:px-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="relative">
            <h2 className="text-2xl font-black text-white sm:text-3xl">مدیریت انتشار را شروع کنید</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/80">
              وارد پنل شوید؛ آپلود، تقویم جلالی، زمانبندی و انتشار واقعی در یوتیوب و اینستاگرام — با مخزن تلگرام.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#881337] transition hover:bg-[#FFF1F2]"
              >
                ورود به پنل
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <a
                href="mailto:amirandali.teams@gmail.com"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/20"
              >
                <Heart className="h-4 w-4" />
                تماس
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#FECDD3] bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-[#881337]/50 sm:px-6">
           <span>© {toPersianDigits(1405)} Publish Platform Emro — موسسه امام روح‌الله</span>
          <span className="flex flex-wrap items-center gap-3">
            <Link href="/privacy" className="hover:text-[#881337]">حریم خصوصی</Link>
            <Link href="/terms" className="hover:text-[#881337]">شرایط استفاده</Link>
            <a href="mailto:amirandali.teams@gmail.com" className="hover:text-[#881337]">تماس</a>
          </span>
        </div>
      </footer>
    </main>
  );
}
