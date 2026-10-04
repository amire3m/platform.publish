"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Compass,
  FileText,
  Images,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  Moon,
  Package,
  Radio,
  Settings,
  Sparkles,
  Sun,
  Target,
  Tv,
  Users,
} from "lucide-react";
import { useTheme, useToast } from "@/components/providers";
import { timedFetch } from "@/lib/fetch-timeout";
import { roleLabelFa } from "@/lib/presentation-fa";
import { NotificationCenter } from "@/components/workflow/NotificationCenter";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { title: string; items: NavItem[]; defaultOpen?: boolean };

const CORE_NAV: NavItem[] = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/content-room", label: "اتاق محتوا", icon: Package },
  { href: "/workflow", label: "اتاق انتشار", icon: ListChecks },
  { href: "/library", label: "کتابخانه", icon: Images },
];
const PUBLISH_NAV: NavItem[] = [
  { href: "/calendar", label: "تقویم", icon: CalendarDays },
  { href: "/live", label: "لایو", icon: Radio },
];
const ANALYTICS_NAV: NavItem[] = [
  { href: "/analytics", label: "آنالیز", icon: BarChart3 },
  { href: "/reports", label: "گزارش‌ها", icon: FileText },
];
const GROWTH_NAV: NavItem[] = [
  { href: "/strategy", label: "استراتژی محتوا", icon: Target },
  { href: "/radar", label: "رادار", icon: Compass },
  { href: "/growth", label: "رشد", icon: Sparkles },
  { href: "/engagement", label: "تعامل", icon: Bell },
  { href: "/retention", label: "نگهداشت", icon: CalendarDays },
  { href: "/operator", label: "اپراتور", icon: Radio },
  { href: "/readiness", label: "آمادگی", icon: AlertTriangle },
];
const MANAGE_NAV: NavItem[] = [
  { href: "/accounts", label: "کانال‌ها", icon: Tv },
  { href: "/users", label: "کاربران", icon: Users },
  { href: "/settings", label: "تنظیمات", icon: Settings },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; role: string; username?: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [canViewWorkflow, setCanViewWorkflow] = useState(false);
  const [canViewMail, setCanViewMail] = useState(false);
  const [canViewContentRoom, setCanViewContentRoom] = useState(false);
  const [canViewAssets, setCanViewAssets] = useState(false);
  const [canManageLive, setCanManageLive] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      try {
        const res = await timedFetch("/api/auth/me", undefined, 15000);
        if (!res.ok) return;
        const body = await res.json();
        const permissions: string[] = body?.data?.permissions ?? body?.permissions ?? [];
        if (!cancelled && Array.isArray(permissions)) {
          if (permissions.includes("view_workflow")) setCanViewWorkflow(true);
          if (permissions.includes("view_mail") || permissions.includes("manage_mail")) setCanViewMail(true);
          if (permissions.includes("view_content_room")) setCanViewContentRoom(true);
          if (permissions.includes("view_assets")) setCanViewAssets(true);
          if (permissions.includes("manage_content_room") || permissions.includes("publish_now")) setCanManageLive(true);
        }
      } catch {
        // keep hidden on error
      }
    }
    loadPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchUnread() {
      try {
        const res = await timedFetch("/api/workflow/notifications?limit=1", undefined, 15000);
        if (!res.ok) return;
        const body = await res.json();
        const count = body?.data?.unreadCount ?? 0;
        if (!cancelled) setUnreadCount(count);
      } catch {
        // ignore
      }
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    showToast("با موفقیت خارج شدید.", "info");
    router.push("/login");
    router.refresh();
  }

  // Filter by permissions: hide items user cannot access to reduce noise
  const coreItems = CORE_NAV.filter((it) => {
    if (it.href === "/workflow" && !canViewWorkflow) return false;
    if (it.href === "/content-room" && !canViewContentRoom) return false;
    if (it.href === "/library" && !canViewAssets) return false;
    return true;
  });
  const publishItems = PUBLISH_NAV.filter((it) => it.href !== "/live" || canManageLive);
  const analyticsItems = ANALYTICS_NAV;
  const growthItems = GROWTH_NAV; // show but collapsed by default
  const manageItems = MANAGE_NAV;
  const mailItems: NavItem[] = canViewMail ? [{ href: "/inbox", label: "صندوق", icon: Mail }] : [];

  const [growthOpen, setGrowthOpen] = useState(false);
  // Auto-open growth group if current path is inside it
  useEffect(() => {
    if (pathname && ["/strategy", "/radar", "/growth", "/engagement", "/retention", "/operator", "/readiness"].some((p) => pathname.startsWith(p))) {
      setGrowthOpen(true);
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-72 transform border-l border-tg-border bg-tg-surface transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-tg-border px-5">
          <img
            src="/brand/imam-logo.png"
            alt="لوگوی مؤسسه امام روح‌الله"
            className="h-12 w-12 shrink-0 rounded-full bg-white object-contain"
          />
          <div>
            <p className="text-sm font-bold text-tg-text">YouTube EmRo</p>
            <p className="text-[11px] text-tg-secondary">مخزن اصلی: گروه تلگرام</p>
          </div>
        </div>
        <nav className="flex flex-col gap-4 overflow-y-auto p-3" style={{ height: "calc(100vh - 4rem)" }}>
          {[
            { title: null as string | null, items: coreItems },
            { title: mailItems.length ? "پیام" : null, items: mailItems },
            { title: "انتشار", items: publishItems },
            { title: "تحلیل", items: analyticsItems },
            { title: "مدیریت", items: manageItems },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.title ?? "core"} className="space-y-1">
                {group.title && <p className="px-2 text-[10px] font-bold tracking-widest text-tg-secondary/70">{group.title}</p>}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active ? "bg-tg-accent text-tg-accent-fg" : "text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}

          {/* Collapsible growth/intelligence group — hidden by default to reduce noise */}
          {growthItems.length > 0 && (
            <div className="space-y-1 border-t border-tg-border pt-3">
              <button
                onClick={() => setGrowthOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[10px] font-bold tracking-widest text-tg-secondary/70 hover:bg-tg-hover hover:text-tg-text"
                aria-expanded={growthOpen}
              >
                <span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> هوش و رشد</span>
                <ChevronDown className={`h-3 w-3 transition ${growthOpen ? "rotate-180" : ""}`} />
              </button>
              {growthOpen && (
                <div className="space-y-0.5">
                  {growthItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          active ? "bg-tg-accent text-tg-accent-fg" : "text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-h-screen flex-1 flex-col lg:mr-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-tg-border bg-tg-surface/80 px-4 backdrop-blur">
          <button
            className="rounded-lg p-2 text-tg-secondary transition hover:bg-tg-hover hover:text-tg-text lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden text-sm text-tg-secondary lg:block">
            منطقه زمانی: Asia/Tehran · تقویم: جلالی
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-lg p-2 text-tg-secondary transition hover:bg-tg-hover hover:text-tg-text"
              aria-label="اعلان‌ها"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span
                  aria-live="polite"
                  className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-tg-secondary transition hover:bg-tg-hover hover:text-tg-text"
              aria-label="تغییر پوسته"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-tg-text">{user.name}</p>
              <p className="text-xs text-tg-secondary">{roleLabelFa(user.role)}</p>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tg-hover px-3 py-1.5 text-xs font-medium text-tg-text transition hover:brightness-95 dark:hover:brightness-125"
            >
              <LogOut className="h-3.5 w-3.5 -scale-x-100" />
              خروج
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
        {!pathname?.startsWith("/board") && (
          <Link
            href="/board"
            className="fixed bottom-4 left-4 z-40 flex min-h-[44px] items-center gap-2 rounded-full bg-tg-accent py-2.5 pl-3 pr-4 text-sm font-bold text-tg-accent-fg shadow-lg transition hover:brightness-110"
            aria-label="گزارش جامع پروژه (نسخه آزمایشی)"
          >
            <FileText className="h-4 w-4" />
            گزارش پروژه
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium">آزمایشی</span>
          </Link>
        )}
        {showNotifications && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setShowNotifications(false)}>
            <div
              className="h-full w-full max-w-sm overflow-y-auto bg-tg-surface p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="مرکز اعلان‌ها"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-tg-text">مرکز اعلان‌ها</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="rounded p-1 text-tg-secondary hover:bg-tg-hover"
                  aria-label="بستن"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4">
                <NotificationCenter />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
