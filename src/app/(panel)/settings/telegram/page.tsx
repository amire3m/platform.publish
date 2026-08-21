"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, X } from "lucide-react";
import { Button, Card, Input, Label, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Topic {
  id: string;
  key: string;
  label: string;
  messageThreadId: number | null;
  isFixed: boolean;
  purpose: string;
}

export default function TelegramSettingsPage() {
  const { data: settingsData } = useSWR("/api/settings", fetcher);
  const { data: topicsData, mutate } = useSWR<{ ok: boolean; data: Topic[] }>("/api/telegram/topics", fetcher);
  const { showToast } = useToast();
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testing, setTesting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const settings = settingsData?.data;
  const topics = topicsData?.data ?? [];

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/telegram/test-connection", { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        showToast(json.error, "error");
        setTestResult(null);
        return;
      }
      setTestResult(json.data);
      showToast("اتصال با موفقیت بررسی شد.", "success");
    } finally {
      setTesting(false);
    }
  }

  async function createTopic(key: string, label: string) {
    const res = await fetch("/api/telegram/topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, label, mode: "create" }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("Topic در تلگرام ایجاد و نگاشت شد.", "success");
    mutate();
  }

  async function mapExisting(key: string, label: string, messageThreadId: number) {
    const res = await fetch("/api/telegram/topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, label, mode: "map", messageThreadId }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("Topic نگاشت شد.", "success");
    setEditingId(null);
    mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">تنظیمات تلگرام</h1>
        <p className="text-sm text-tg-secondary">مخزن اصلی محتوا و داده‌های سیستم</p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">اتصال گروه</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            توکن ربات: <StatusBadge status={settings?.telegramBotTokenConfigured ? "connected" : "disconnected"} />
          </p>
          <p>
            شناسه گروه: <span className="font-mono text-xs">{settings?.telegramGroupIdMasked ?? "—"}</span>
          </p>
        </div>
        <p className="mt-2 text-xs text-tg-secondary/80">
          توکن ربات و شناسه گروه از طریق متغیرهای محیطی TELEGRAM_BOT_TOKEN و TELEGRAM_GROUP_ID تنظیم می‌شوند و در پنل نمایش داده نمی‌شوند.
        </p>
        <Button className="mt-3" onClick={testConnection} disabled={testing}>
          {testing ? "در حال بررسی..." : "تست اتصال"}
        </Button>
        {testResult && (
          <div className="mt-3 grid gap-2 rounded-xl bg-tg-hover p-3 text-xs sm:grid-cols-3">
            <p className="flex items-center gap-1">
              ربات ادمین است:
              {(testResult as { botIsAdmin?: boolean }).botIsAdmin ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <X className="h-4 w-4 text-rose-500" />
              )}
            </p>
            <p className="flex items-center gap-1">
              سوپرگروه است:
              {(testResult as { isSupergroup?: boolean }).isSupergroup ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <X className="h-4 w-4 text-rose-500" />
              )}
            </p>
            <p className="flex items-center gap-1">
              Topics فعال است:
              {(testResult as { topicsEnabled?: boolean }).topicsEnabled ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <X className="h-4 w-4 text-rose-500" />
              )}
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">نگاشت Topicها</h2>
        <p className="mb-3 text-xs text-tg-secondary/80">
          Bot API قابلیت فهرست کردن Topicهای موجود را ندارد؛ برای هر مورد یا از دکمه «ایجاد از طریق ربات» استفاده کنید یا شناسه message_thread_id
          موجود را دستی وارد کنید.
        </p>
        <div className="space-y-2">
          {topics.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-tg-border p-3 text-sm">
              <div>
                <p className="font-medium">{t.label}</p>
                <p className="text-xs text-tg-secondary/80">{t.purpose}</p>
              </div>
              <div className="flex items-center gap-2">
                {t.messageThreadId ? (
                  <StatusBadge status="connected" />
                ) : editingId === t.id ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="message_thread_id"
                      className="w-32"
                    />
                    <Button size="sm" onClick={() => mapExisting(t.key, t.label, Number(editValue))}>
                      ثبت
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => createTopic(t.key, t.label)}>
                      ایجاد از طریق ربات
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(t.id)}>
                      نگاشت دستی
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
