"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Archive, Check, Clock, Paperclip, PauseCircle, Rocket, RotateCcw, Send, Undo2 } from "lucide-react";
import { Button, Card, ConfirmModal, Modal, StatusBadge, Textarea } from "@/components/ui";
import { useToast } from "@/components/providers";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { JalaliDateTimePicker } from "@/components/JalaliDateTimePicker";
import { deliverableKindLabelFa, platformLabelFa } from "@/lib/presentation-fa";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PlatformTarget {
  platform: string;
  account_id: string;
  content_type: string;
  status: string;
  publish_at_jalali?: string;
  externalId?: string;
  permalink?: string;
  lastError?: string;
  attempts?: number;
}

interface ContentDetail {
  id: string;
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  status: string;
  approvalStatus: string;
  approvedBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scheduledAtJalali: string | null;
  scheduledAtUtc: string | null;
  media: { file_name: string; mime_type: string; size: number }[];
  platformTargets: PlatformTarget[];
  publishResults: Record<string, unknown>[];
  error: Record<string, unknown> | null;
  telegramLink: string | null;
}

export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: ContentDetail }>(`/api/content/${id}`, fetcher);
  const { data: meData } = useSWR<{ ok: boolean; data: { permissions: string[] } }>("/api/auth/me", fetcher);
  const { showToast } = useToast();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pendingUtc, setPendingUtc] = useState("");
  const [pendingJalali, setPendingJalali] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | { action: string; label: string; danger?: boolean }>(null);
  const [busy, setBusy] = useState(false);

  const permissions = meData?.data?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  async function runAction(action: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/content/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!json.ok) {
        showToast(json.error ?? "عملیات ناموفق بود.", "error");
        return;
      }
      showToast("عملیات با موفقیت انجام شد.", "success");
      mutate();
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  if (isLoading) return <p className="text-sm text-tg-secondary">در حال بارگذاری...</p>;
  const row = data?.data;
  if (!row) return <p className="text-sm text-rose-600">محتوا یافت نشد.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">{row.title || "(بدون عنوان)"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={row.status} />
            <StatusBadge status={row.approvalStatus} />
            <span className="text-xs text-tg-secondary/80">شناسه: {row.id}</span>
          </div>
        </div>
        {row.telegramLink && (
          <a href={row.telegramLink} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <Send className="h-4 w-4 -scale-x-100" />
              مشاهده در تلگرام
            </Button>
          </a>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold text-tg-text">محتوا</h2>
        <p className="text-sm text-tg-text/75">
          <strong>توضیحات:</strong> {row.description || "—"}
        </p>
        <p className="mt-2 text-sm text-tg-text/75">
          <strong>کپشن:</strong> {row.caption || "—"}
        </p>
        <p className="mt-2 text-sm text-tg-text/75">
          <strong>هشتگ‌ها:</strong> {row.hashtags?.join(" ") || "—"}
        </p>
        <div className="mt-3 space-y-1 text-xs text-tg-secondary">
          {row.media?.map((m, i) => (
            <p key={i}>
              <Paperclip className="ml-1 inline h-3 w-3" /> {m.file_name} — {(m.size / (1024 * 1024)).toFixed(1)} مگابایت ({m.mime_type})
            </p>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-tg-text">وضعیت انتشار هر پلتفرم</h2>
        <div className="space-y-3">
          {row.platformTargets?.map((t, i) => (
            <div key={i} className="rounded-xl border border-tg-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {platformLabelFa(t.platform)} · {deliverableKindLabelFa(t.content_type)} — {t.account_id}
                </span>
                <StatusBadge status={t.status} />
              </div>
              {t.publish_at_jalali && <p className="mt-1 text-xs text-tg-secondary">زمان: {t.publish_at_jalali}</p>}
              {t.permalink && (
                <a href={t.permalink} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-tg-accent hover:underline">
                  مشاهده پست منتشرشده
                </a>
              )}
              {t.lastError && <p className="mt-1 text-xs text-rose-600">خطا: {t.lastError}</p>}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-tg-text">عملیات</h2>
        <div className="flex flex-wrap gap-2">
          {can("submit_for_review") && ["draft", "uploaded", "changes_requested"].includes(row.status) && (
            <Button onClick={() => runAction("submit-review")} disabled={busy}>
              ارسال برای تأیید
            </Button>
          )}
          {can("approve_content") && row.status === "in_review" && (
            <>
              <Button onClick={() => runAction("approve")} disabled={busy}>
                <Check className="h-4 w-4" />
                تأیید
              </Button>
              <Button variant="secondary" onClick={() => setReasonOpen(true)} disabled={busy}>
                <Undo2 className="h-4 w-4" />
                درخواست اصلاح
              </Button>
            </>
          )}
          {can("schedule_content") && ["approved"].includes(row.status) && (
            <Button variant="secondary" onClick={() => setScheduleOpen(true)} disabled={busy}>
              <Clock className="h-4 w-4" />
              زمان‌بندی
            </Button>
          )}
          {can("schedule_content") && row.status === "scheduled" && (
            <Button variant="secondary" onClick={() => setConfirmAction({ action: "cancel", label: "لغو زمان‌بندی این محتوا؟" })} disabled={busy}>
              <PauseCircle className="h-4 w-4" />
              لغو زمان‌بندی
            </Button>
          )}
          {can("publish_now") && ["draft", "uploaded", "in_review", "changes_requested", "approved", "scheduled"].includes(row.status) && (
            <Button onClick={() => setConfirmAction({ action: "publish-now", label: row.approvalStatus !== "approved" ? "محتوا تأیید و هم‌اکنون منتشر شود؟" : "محتوا هم‌اکنون منتشر شود؟" })} disabled={busy}>
              <Rocket className="h-4 w-4" />
              {row.approvalStatus !== "approved" ? "تأیید و انتشار آنی" : "انتشار فوری"}
            </Button>
          )}
          {can("publish_now") && row.status === "failed" && (
            <Button onClick={() => runAction("retry")} disabled={busy}>
              <RotateCcw className="h-4 w-4" />
              تلاش مجدد
            </Button>
          )}
          {can("edit_content") && !["archived"].includes(row.status) && (
            <Button variant="ghost" onClick={() => setConfirmAction({ action: "archive", label: "این محتوا آرشیو شود؟" })} disabled={busy}>
              <Archive className="h-4 w-4" />
              آرشیو
            </Button>
          )}
        </div>
      </Card>

      <Modal open={reasonOpen} onClose={() => setReasonOpen(false)} title="درخواست اصلاح">
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل درخواست اصلاح را بنویسید..." />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReasonOpen(false)}>
            انصراف
          </Button>
          <Button
            onClick={async () => {
              await runAction("request-changes", { reason });
              setReasonOpen(false);
            }}
          >
            ثبت درخواست
          </Button>
        </div>
      </Modal>

      <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="زمان‌بندی انتشار">
        <JalaliDateTimePicker
          onChange={(utc, jalali) => {
            setPendingUtc(utc);
            setPendingJalali(jalali);
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setScheduleOpen(false)}>
            انصراف
          </Button>
          <Button
            onClick={async () => {
              await runAction("schedule", { scheduledAtUtc: pendingUtc, scheduledAtJalali: pendingJalali });
              setScheduleOpen(false);
            }}
          >
            ثبت زمان‌بندی
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && runAction(confirmAction.action)}
        title="تأیید عملیات"
        description={confirmAction?.label ?? ""}
        danger={confirmAction?.danger}
        loading={busy}
      />

      <DiscoverabilityPanel contentId={row.id} />

      <p className="text-xs text-tg-secondary/80">
        ایجاد: {formatJalaliDateTime(row.createdAt)} · آخرین ویرایش: {formatJalaliDateTime(row.updatedAt)}
      </p>
    </div>
  );
}

function DiscoverabilityPanel({ contentId }: { contentId: string }) {
  const { data, mutate } = useSWR<{ ok: boolean; data: { history: Array<{ run: { id: string; createdAt: string }; findings: Array<{ id: string; ruleId: string; severity: string; message: string; dismissed: boolean }> }> } }>(
    `/api/discoverability?contentId=${contentId}`,
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  async function audit() {
    setBusy(true);
    try {
      const res = await fetch("/api/discoverability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "audit", contentId }) });
      const j = await res.json();
      if (!j.ok) alert(j.error ?? "خطا");
      await mutate();
    } finally { setBusy(false); }
  }
  const latest = data?.data?.history?.[0];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-tg-text">پیش‌پرواز کشف‌پذیری (DarkzSEO bundled)</h3>
        <Button size="sm" onClick={audit} disabled={busy} className="min-h-[36px] text-xs">{busy ? "در حال بررسی…" : "اجرای بررسی"}</Button>
      </div>
      {!latest ? <p className="mt-2 text-xs text-tg-secondary">هنوز بررسی نشده.</p> : (
        <div className="mt-2 space-y-1">
          {latest.findings.map((f) => (
            <div key={f.id} className={`rounded-lg border p-2 text-xs ${f.dismissed ? "opacity-50" : ""} ${f.severity === "fail" ? "border-rose-200 bg-rose-50" : f.severity === "warn" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <span className="font-mono text-[10px]">{f.ruleId}</span> — {f.message} {f.dismissed ? "(رد شده)" : ""}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
