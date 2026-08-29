"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  FileText,
  FolderOpen,
  Images,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  Moon,
  Package,
  PlusCircle,
  ScrollText,
  Send,
  Settings,
  Sun,
  Tv,
  Users,
} from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { useTheme, useToast } from "@/components/providers";
import { roleLabelFa } from "@/lib/presentation-fa";
import { NotificationCenter } from "@/components/workflow/NotificationCenter";

const NAV_ITEMS = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/calendar", label: "تقویم انتشار", icon: CalendarDays },
  { href: "/accounts", label: "کانال‌ها و پیج‌ها", icon: Tv },
  { href: "/users", label: "کاربران و تیم", icon: Users },
  { href: "/analytics", label: "آنالیز", icon: BarChart3 },
  { href: "/reports", label: "گزارش‌ها", icon: FileText },
  { href: "/settings/telegram", label: "تنظیمات تلگرام", icon: Send },
  { href: "/settings/youtube", label: "تنظیمات یوتیوب", icon: YoutubeIcon },
  { href: "/settings/instagram", label: "تنظیمات اینستاگرام", icon: InstagramIcon },
  { href: "/settings/general", label: "تنظیمات عمومی", icon: Settings },
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const body = await res.json();
        const permissions: string[] = body?.data?.permissions ?? body?.permissions ?? [];
        if (!cancelled && Array.isArray(permissions)) {
          if (permissions.includes("view_workflow")) setCanViewWorkflow(true);
          if (permissions.includes("view_mail") || permissions.includes("manage_mail")) setCanViewMail(true);
          if (permissions.includes("view_content_room")) setCanViewContentRoom(true);
          if (permissions.includes("view_assets")) setCanViewAssets(true);
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
        const res = await fetch("/api/workflow/notifications?limit=1");
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

  const workflowNavItem = { href: "/workflow", label: "اتاق انتشار", icon: ListChecks } as const;
  const mailNavItem = { href: "/inbox", label: "صندوق", icon: Mail } as const;
  const contentRoomNavItem = { href: "/content-room", label: "اتاق محتوا", icon: Package } as const;
  const assetsNavItem = { href: "/library", label: "کتابخانه", icon: Images } as const;
  const withWorkflow = canViewWorkflow
    ? ([NAV_ITEMS[0], workflowNavItem, ...NAV_ITEMS.slice(1)] as typeof NAV_ITEMS)
    : NAV_ITEMS;
  const withContentRoom = canViewContentRoom
    ? ([withWorkflow[0], contentRoomNavItem, ...withWorkflow.slice(1)] as typeof NAV_ITEMS)
    : withWorkflow;
  const withAssets = canViewAssets
    ? ([withContentRoom[0], assetsNavItem, ...withContentRoom.slice(1)] as typeof NAV_ITEMS)
    : withContentRoom;
  const visibleNavItems = canViewMail ? ([...withAssets.slice(0, 2), mailNavItem, ...withAssets.slice(2)] as typeof NAV_ITEMS) : withAssets;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-72 transform border-l border-tg-border bg-tg-surface transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-tg-border px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tg-accent text-white">
            <Send className="h-5 w-5 -scale-x-100" />
          </span>
          <div>
            <p className="text-sm font-bold text-tg-text">YouTube EmRo</p>
            <p className="text-[11px] text-tg-secondary">مخزن اصلی: گروه تلگرام</p>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-3" style={{ height: "calc(100vh - 4rem)" }}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-tg-accent text-tg-accent-fg"
                    : "text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
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
