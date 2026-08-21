"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { Button, Card, ConfirmModal, EmptyState, Input, Label, Modal, Select, Skeleton, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Account {
  id: string;
  platform: "youtube" | "instagram";
  username: string;
  displayName: string;
  active: boolean;
  connectionStatus: string;
  topicId: string | null;
  topicLabel: string | null;
  lastSyncAt: string | null;
  capabilities: Record<string, unknown>;
}

interface Topic {
  id: string;
  key: string;
  label: string;
  messageThreadId: number | null;
}

export default function AccountsPage() {
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: Account[] }>("/api/accounts", fetcher);
  const { data: topicsData } = useSWR<{ ok: boolean; data: Topic[] }>("/api/telegram/topics", fetcher);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"youtube" | "instagram">("youtube");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [topicId, setTopicId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) showToast("حساب با موفقیت متصل شد.", "success");
    if (params.get("error")) showToast(`خطا در اتصال: ${params.get("error")}`, "error");
  }, [showToast]);

  async function connectMock() {
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/connect/${platform}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "mock", username, displayName, topicId: topicId || undefined }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      showToast("حساب آزمایشی ایجاد شد.", "success");
      setOpen(false);
      setUsername("");
      setDisplayName("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function connectOauth() {
    const res = await fetch(`/api/accounts/connect/${platform}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "oauth", username: "-", displayName: "-" }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    window.location.href = json.data.authUrl;
  }

  async function deleteAccount() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      showToast("حساب قطع و غیرفعال شد.", "success");
      mutate();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function changeTopic(account: Account, newTopicId: string) {
    setSavingTopicId(account.id);
    try {
      const topic = topics?.find((t) => t.id === newTopicId);
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId: newTopicId || null,
          topicMessageThreadId: topic?.messageThreadId ?? null,
          topicLabel: topic?.label ?? null,
        }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      showToast("تاپیک صف به‌روزرسانی شد.", "success");
      mutate();
    } finally {
      setSavingTopicId(null);
    }
  }

  const accounts = data?.data ?? [];
  const topics = topicsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">کانال‌ها و پیج‌ها</h1>
          <p className="text-sm text-tg-secondary">مدیریت کانال‌های یوتیوب و پیج‌های اینستاگرام متصل</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          افزودن حساب
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <EmptyState
          title="هنوز حسابی متصل نشده است"
          description="یک کانال یوتیوب یا پیج اینستاگرام اضافه کنید تا بتوانید محتوا برایش زمان‌بندی کنید."
          action={<Button onClick={() => setOpen(true)}>افزودن حساب</Button>}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className={a.active ? "" : "opacity-60"}>
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-tg-hover text-tg-secondary">
                  {a.platform === "youtube" ? <YoutubeIcon className="h-5 w-5 text-red-500" /> : <InstagramIcon className="h-5 w-5 text-fuchsia-500" />}
                </span>
                <p className="mt-1 font-semibold text-tg-text">{a.displayName}</p>
                <p className="text-xs text-tg-secondary">@{a.username}</p>
              </div>
              <StatusBadge status={a.active ? a.connectionStatus : "disconnected"} />
            </div>
            <div className="mt-4 space-y-1 text-xs text-tg-secondary">
              <p>آخرین همگام‌سازی: {a.lastSyncAt ? formatJalaliDateTime(a.lastSyncAt) : "—"}</p>
              <label className="mb-1 block pt-1 text-[11px] font-semibold">Topic صف انتشار</label>
              <Select
                value={a.topicId ?? ""}
                onChange={(e) => changeTopic(a, e.target.value)}
                disabled={savingTopicId === a.id}
                className="text-xs"
              >
                <option value="">— بدون Topic اختصاصی —</option>
                {topics
                  .filter((t) => t.messageThreadId && t.messageThreadId !== 1)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
              </Select>
            </div>
            {a.connectionStatus === "mock" && (
              <p className="mt-3 rounded-lg bg-fuchsia-500/10 px-2 py-1 text-[11px] text-fuchsia-600 dark:text-fuchsia-400">
                این حساب آزمایشی است و انتشار واقعی در آن انجام نمی‌شود.
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a)} disabled={!a.active}>
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="افزودن حساب جدید">
        <div className="space-y-3">
          <div>
            <Label>پلتفرم</Label>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value as "youtube" | "instagram")}>
              <option value="youtube">یوتیوب</option>
              <option value="instagram">اینستاگرام</option>
            </Select>
          </div>
          <div>
            <Label>نام کاربری / شناسه</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="مثلاً zaviye_no" />
          </div>
          <div>
            <Label>نام نمایشی</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="مثلاً زاویه نو" />
          </div>
          <div>
            <Label>Topic صف انتشار اختصاصی</Label>
            <Select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">بدون Topic اختصاصی</option>
              {topics
                .filter((t) => t.messageThreadId && t.messageThreadId !== 1)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" variant="secondary" onClick={connectOauth}>
              اتصال رسمی OAuth
            </Button>
            <Button className="flex-1" onClick={connectMock} disabled={saving || !username || !displayName}>
              {saving ? "در حال ایجاد..." : "ایجاد حساب آزمایشی"}
            </Button>
          </div>
          <p className="text-[11px] text-tg-secondary/80">
            اتصال OAuth نیازمند پیکربندی متغیرهای محیطی Google/Meta است؛ در غیر این صورت پیام «پیکربندی نشده» نمایش داده می‌شود.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteAccount}
        title="حذف حساب"
        description={
          deleteTarget
            ? `حساب «${deleteTarget.displayName}» قطع و غیرفعال می‌شود. محتوای قبلی حفظ می‌شود ولی این حساب دیگر برای انتشار در دسترس نیست.`
            : ""
        }
        danger
        loading={deleting}
      />
    </div>
  );
}
