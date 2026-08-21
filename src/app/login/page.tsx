"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/providers";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [devTelegramId, setDevTelegramId] = useState("");
  const [devName, setDevName] = useState("");
  const [loading, setLoading] = useState(false);
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const devLoginEnabled = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "1";

  useEffect(() => {
    window.onTelegramAuth = async (tgUser) => {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tgUser),
        });
        const json = await res.json();
        if (!json.ok) {
          showToast(json.error ?? "ورود ناموفق بود.", "error");
          return;
        }
        showToast("خوش آمدید!", "success");
        router.push("/dashboard");
        router.refresh();
      } finally {
        setLoading(false);
      }
    };

    // Telegram Mini App: if we are running inside the Telegram WebView, sign in
    // automatically with the injected initData and go straight to the panel.
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
    const initData = tg?.initData;
    if (initData) {
      setLoading(true);
      (async () => {
        try {
          const res = await fetch("/api/auth/mini-app", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ initData }),
          });
          const json = await res.json();
          if (json.ok) {
            showToast("خوش آمدید!", "success");
            router.replace("/dashboard");
            router.refresh();
            return;
          }
          showToast(json.error ?? "ورود ناموفق بود.", "error");
        } catch {
          showToast("خطا در ورود با تلگرام.", "error");
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    if (botUsername && widgetRef.current) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");
      widgetRef.current.appendChild(script);
    }
  }, [botUsername, router, showToast]);

  async function devLogin() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telegramId: devTelegramId, name: devName }),
      });
      const json = await res.json();
      if (!json.ok) {
        showToast(json.error ?? "ورود ناموفق بود.", "error");
        return;
      }
      showToast("خوش آمدید!", "success");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tg-bg p-4">
      <Card className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tg-accent text-white">
          <Send className="h-8 w-8 -scale-x-100" />
        </div>
        <h1 className="text-xl font-bold text-tg-text">ورود به YouTube EmRo</h1>
        <p className="mt-2 text-sm text-tg-secondary">
          پلتفرم مدیریت چند کانال یوتیوب و پیج اینستاگرام با مخزن اصلی تلگرام
        </p>

        <div className="mt-6 flex justify-center" ref={widgetRef}>
          {!botUsername && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              برای فعال‌سازی ورود با تلگرام، متغیر NEXT_PUBLIC_TELEGRAM_BOT_USERNAME را تنظیم کنید.
            </p>
          )}
        </div>

        {devLoginEnabled && (
          <div className="mt-8 border-t border-dashed border-tg-border pt-6 text-right">
            <p className="mb-3 text-center text-xs font-semibold text-amber-600 dark:text-amber-400">
              حالت ورود آزمایشی (فقط برای توسعه)
            </p>
            <div className="space-y-3">
              <div>
                <Label>شناسه عددی تلگرام</Label>
                <Input value={devTelegramId} onChange={(e) => setDevTelegramId(e.target.value)} placeholder="مثلاً 123456789" />
              </div>
              <div>
                <Label>نام نمایشی</Label>
                <Input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="نام شما" />
              </div>
              <Button className="w-full" onClick={devLogin} disabled={loading || !devTelegramId}>
                {loading ? "در حال ورود..." : "ورود آزمایشی"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
