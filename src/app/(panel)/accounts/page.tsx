"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { Button, Card, ConfirmModal, EmptyState, Label, Modal, Select, Skeleton, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import type { PublicAccountDto } from "@/lib/accounts/public";
import { oauthErrorMessageFa } from "@/lib/presentation-fa";
import { MAIN_REPORT_ALIAS, ORGANIZATION_LABELS, type AccountOrganization } from "@/lib/accounts/organization";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Account = PublicAccountDto & { platform: "youtube" | "instagram" };

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
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);
  const [savingOrganizationId, setSavingOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) showToast("حساب با موفقیت متصل شد.", "success");
    if (params.get("error")) showToast(oauthErrorMessageFa(params.get("error")), "error");
  }, [showToast]);

  async function connectOauth() {
    const res = await fetch(`/api/accounts/connect/${platform}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "oauth" }),
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
      showToast("کانال یا پیج برای همیشه حذف شد.", "success");
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

  async function changeOrganization(account: Account, organization: string) {
    setSavingOrganizationId(account.id);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organization: organization || null }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      showToast("وابستگی سازمانی حساب به‌روزرسانی شد.", "success");
      mutate();
    } finally {
      setSavingOrganizationId(null);
    }
  }

  const accounts = data?.data ?? [];
  const topics = topicsData?.data ?? [];
  const accountGroups = [
    { id: "emro", label: "کانال‌ها و پیج‌های موسسه امام روح‌الله", accounts: accounts.filter((account) => account.organization === "emro") },
    { id: "sana", label: "کانال‌ها و پیج‌های سنا", accounts: accounts.filter((account) => account.organization === "sana") },
    { id: "unassigned", label: "حساب‌های تعیین‌نشده", accounts: accounts.filter((account) => !account.organization) },
  ].filter((group) => group.accounts.length > 0);

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

      <div className="space-y-6">
        {accountGroups.map((group) => (
          <section key={group.id} aria-labelledby={`account-group-${group.id}`}>
            <h2 id={`account-group-${group.id}`} className="mb-3 text-sm font-bold text-tg-text">{group.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.accounts.map((a) => (
                <Card key={a.id} className={a.active ? "" : "opacity-60"}>
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-tg-hover text-tg-secondary">
                  {a.platform === "youtube" ? <YoutubeIcon className="h-5 w-5 text-red-500" /> : <InstagramIcon className="h-5 w-5 text-fuchsia-500" />}
                </span>
                <p className="mt-1 font-semibold text-tg-text">{a.displayName}</p>
                <p className="text-xs text-tg-secondary">@{a.username}</p>
                {a.organization === "emro" && <span className="mt-2 inline-flex rounded-full bg-tg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-tg-accent">گزارش اصلی: {MAIN_REPORT_ALIAS}</span>}
              </div>
              <StatusBadge status={a.active ? a.connectionStatus : "disconnected"} />
            </div>
            <div className="mt-4 space-y-1 text-xs text-tg-secondary">
              <p>آخرین همگام‌سازی: {a.lastSyncAt ? formatJalaliDateTime(a.lastSyncAt) : "—"}</p>
              <label className="mb-1 block pt-1 text-[11px] font-semibold">وابستگی سازمانی</label>
              <Select
                value={a.organization ?? ""}
                onChange={(e) => changeOrganization(a, e.target.value)}
                disabled={savingOrganizationId === a.id}
                className="text-xs"
              >
                <option value="">تعیین‌نشده (بدون نمایش در گزارش اصلی)</option>
                {(Object.entries(ORGANIZATION_LABELS) as Array<[AccountOrganization, string]>).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <label className="mb-1 block pt-1 text-[11px] font-semibold">تاپیک صف انتشار</label>
              <Select
                value={a.topicId ?? ""}
                onChange={(e) => changeTopic(a, e.target.value)}
                disabled={savingTopicId === a.id}
                className="text-xs"
              >
                <option value="">— بدون تاپیک اختصاصی —</option>
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
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a)}>
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </Button>
            </div>
                </Card>
              ))}
            </div>
          </section>
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
          <Button className="w-full" onClick={connectOauth}>
            اتصال رسمی OAuth
          </Button>
          <p className="text-[11px] text-tg-secondary/80">
            برای ادامه، وارد حساب Google یا Instagram خود می‌شوید و دسترسی لازم را تأیید می‌کنید.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteAccount}
        title="حذف دائمی کانال یا پیج"
        description={
          deleteTarget
            ? `«${deleteTarget.displayName}» و اطلاعات اتصال آن برای همیشه حذف می‌شود. سابقه محتوای منتشرشده حفظ خواهد شد، اما این عملیات قابل بازگشت نیست.`
            : ""
        }
        danger
        loading={deleting}
        confirmLabel="حذف برای همیشه"
      />
    </div>
  );
}
