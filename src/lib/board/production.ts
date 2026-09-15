"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductionItem } from "./types";
import { PRODUCTION_STATUSES } from "./channels";

const KEY = "board-report:production:v1";

let seq = 0;
export function nextProductionId(): string {
  seq++;
  return `BP-${Date.now().toString(36)}-${seq}`;
}

export function seedProduction(): ProductionItem[] {
  return [
    {
      id: "demo-mosh1", project: "مشاور ۱", program: "مشاور ۱", channel: "تماشین", contentType: "سریال",
      episodes: 13, editStatus: "reviewing", progress: 90, reviewStatus: "در حال بازبینی نهایی",
      licenseStatus: "منتظر تأیید صداوسیما", publishStatus: "منتظر مجوز", owner: "—",
      startDate: "2025-10-01", etaDate: "2026-11-01", notes: "انتشار منوط به تأیید نهایی و حذف از کانال‌های دیگر است.",
    },
    {
      id: "demo-mosh2", project: "مشاور ۲", program: "مشاور ۲", channel: "تماشین", contentType: "سریال",
      episodes: 13, editStatus: "ready", progress: 100, reviewStatus: "تأیید شده",
      licenseStatus: "—", publishStatus: "پس از فصل اول مشاور ۱", owner: "—",
      startDate: "2026-02-01", etaDate: "2027-02-01", notes: "کاملاً آماده است.",
    },
    {
      id: "demo-farat", project: "فرات — فصل جدید", program: "فرات", channel: "زاویه نو", contentType: "گفت‌وگو",
      episodes: 8, editStatus: "editing", progress: 45, reviewStatus: "—",
      licenseStatus: "—", publishStatus: "در حال تدوین", owner: "—",
      startDate: "2026-06-01", etaDate: "2026-12-01", notes: "",
    },
  ];
}

export function statusLabel(id: string): string {
  return PRODUCTION_STATUSES.find((s) => s.id === id)?.label ?? id;
}

function readStored(): ProductionItem[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function useProduction() {
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setItems(stored ?? seedProduction());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
  }, [items, loaded]);

  const upsert = useCallback((item: ProductionItem) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === item.id);
      if (i === -1) return [...prev, item];
      const next = [...prev];
      next[i] = item;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { items, loaded, upsert, remove };
}
