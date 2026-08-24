"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { notificationEventLabelFa } from "@/lib/presentation-fa";

interface NotificationItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  readAt: string | null;
  createdAt: string;
  links?: Record<string, string>;
}

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/workflow/notifications");
      if (!res.ok) throw new Error("خطا در دریافت اعلان‌ها");
      const body = await res.json();
      const data = body.data ?? body;
      setItems(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function markOne(id: string) {
    setMarking(id);
    try {
      const res = await fetch("/api/workflow/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("خطا");
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, readAt: new Date().toISOString() } : it)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarking(null);
    }
  }

  async function markAll() {
    setMarking("all");
    try {
      const res = await fetch("/api/workflow/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error("خطا");
      setItems((prev) => prev.map((it) => ({ ...it, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarking(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-tg-border bg-tg-surface p-4" aria-live="polite">
        <p className="text-sm text-tg-secondary">در حال بارگذاری اعلان‌ها...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={fetchNotifications} className="mt-2 text-sm font-medium text-red-600 underline">
          تلاش مجدد
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-tg-border bg-tg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-tg-text">اعلان‌ها</h3>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="rounded-full bg-tg-accent px-2 py-0.5 text-xs font-medium text-white">
            {unreadCount} خوانده‌نشده
          </span>
          {unreadCount > 0 && (
            <button
              onClick={markAll}
              disabled={marking === "all"}
              className="text-xs font-medium text-tg-accent hover:underline disabled:opacity-50"
              aria-label="خوانده‌شده کردن همه"
            >
              {marking === "all" ? "در حال انجام..." : "خوانده‌شده همه"}
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-tg-secondary">اعلانی وجود ندارد.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-start justify-between rounded-lg border p-3 ${item.readAt ? "border-tg-border bg-tg-surface" : "border-amber-200 bg-amber-50"}`}
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-tg-text">{String(item.payload?.title ?? item.payload?.deliverableName ?? notificationEventLabelFa(item.eventType))}</p>
                <p className="text-xs text-tg-secondary">{notificationEventLabelFa(item.eventType)} · {new Date(item.createdAt).toLocaleString("fa-IR")}</p>
                {item.links && Object.keys(item.links).length > 0 && (
                  <div className="mt-1 flex gap-2">
                    {Object.entries(item.links).map(([key, href]) => (
                      <Link key={key} href={href} className="text-xs font-medium text-tg-accent hover:underline">
                        {key === "deliverable" ? "مشاهده خروجی" : key === "publication" ? "مشاهده انتشار" : "اتاق انتشار"}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {!item.readAt && (
                <button
                  onClick={() => markOne(item.id)}
                  disabled={marking === item.id}
                  className="ml-2 rounded px-2 py-1 text-xs font-medium text-tg-secondary hover:bg-tg-hover disabled:opacity-50"
                  aria-label={`خوانده‌شده کردن اعلان ${item.id}`}
                >
                  {marking === item.id ? "..." : "خوانده شد"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
