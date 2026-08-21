"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Theme (dark mode)
// ---------------------------------------------------------------------------
interface ThemeContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside Providers");
  return ctx;
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("emro-theme") : null;
    const tg = (window as unknown as { Telegram?: { WebApp?: { colorScheme?: string } } }).Telegram?.WebApp;
    const initial: "light" | "dark" =
      tg?.colorScheme === "dark" ? "dark" : stored === "dark" ? "dark" : stored === "light" ? "light" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  // Telegram Mini App lifecycle: signal ready, expand to full height, and wire
  // the native back button to close the app (only inside the Telegram WebView).
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: Record<string, unknown> } }).Telegram?.WebApp;
    if (!tg) return;
    if (typeof tg.ready === "function") tg.ready();
    if (typeof tg.expand === "function") tg.expand();
    const back = tg.BackButton as { show?: () => void; onClick?: (fn: () => void) => void } | undefined;
    if (back && typeof back.show === "function") {
      back.show();
      if (typeof back.onClick === "function") back.onClick(() => (tg.close as () => void)?.());
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem("emro-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export interface ToastItem {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
}
interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, variant?: ToastItem["variant"]) => void;
}
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside Providers");
  return ctx;
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastItem["variant"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ toasts, showToast }), [toasts, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed left-1/2 top-4 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:right-4 sm:left-auto sm:translate-x-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.variant === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : t.variant === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300"
                  : "border-tg-border bg-tg-surface/95 text-tg-text"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
