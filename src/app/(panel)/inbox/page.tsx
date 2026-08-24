"use client";

import { useState } from "react";
import useSWR from "swr";
import { Mail, Send, RefreshCw, Inbox } from "lucide-react";
import { Button, Card, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { formatJalaliDateTime } from "@/lib/date/jalali";

type MailAccount = "info" | "support";
interface MailMessage {
  id: string;
  uid: number;
  account: MailAccount;
  from: { address: string; name?: string };
  subject: string;
  date: string;
  text?: string;
  html?: string;
  snippet?: string;
  seen: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error ?? "خطا");
  return body.data as { account: MailAccount; messages: MailMessage[] };
};

export default function InboxPage() {
  const [account, setAccount] = useState<MailAccount>("info");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: "", subject: "", text: "" });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(`mail-${account}`, () => fetcher(`/api/mail/messages?account=${account}&limit=30`), {
    revalidateOnFocus: false,
  });

  const messages = data?.messages ?? [];
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    setSendError(null);
    setSendOk(null);
    if (!compose.to || !compose.subject || !compose.text) {
      setSendError("همه فیلدها الزامی هستند");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: account, to: compose.to, subject: compose.subject, text: compose.text }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "خطا در ارسال");
      setSendOk("پیام با موفقیت ارسال شد");
      setCompose({ to: "", subject: "", text: "" });
      setTimeout(() => setComposeOpen(false), 800);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "خطا");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tg-accent text-white">
            <Inbox className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-tg-text">صندوق ورودی</h1>
            <p className="text-xs text-tg-secondary">ایمیل‌های info@ و support@ روی mail.litecombomovie.ir</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={account} onChange={(e) => { setAccount(e.target.value as MailAccount); setSelectedId(null); }} aria-label="انتخاب صندوق" className="w-40">
            <option value="info">info@litecombomovie.ir</option>
            <option value="support">support@litecombomovie.ir</option>
          </Select>
          <Button variant="secondary" onClick={() => mutate()} aria-label="بروزرسانی">
            <RefreshCw className="h-4 w-4" /> بروزرسانی
          </Button>
          <Button onClick={() => setComposeOpen(true)}>
            <Send className="h-4 w-4" /> ارسال جدید
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{(error as Error).message}</div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        {/* List */}
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-tg-border px-4 py-2.5 flex items-center justify-between bg-tg-hover/40">
            <span className="text-sm font-semibold text-tg-text flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {account === "info" ? "info@litecombomovie.ir" : "support@litecombomovie.ir"}
            </span>
            <span className="text-xs text-tg-secondary">{messages.length} پیام</span>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              <div className="skeleton h-14 rounded-lg" />
              <div className="skeleton h-14 rounded-lg" />
              <div className="skeleton h-14 rounded-lg" />
            </div>
          ) : messages.length === 0 ? (
            <div className="p-10 text-center text-sm text-tg-secondary">
              {error ? "خطا در دریافت" : "صندوق خالی است یا اطلاعات ورود تنظیم نشده است."}
              <p className="mt-2 text-xs">برای اتصال واقعی، اطلاعات ورود صندوق‌های ایمیل را در تنظیمات سرور وارد کنید.</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => mutate()}>
                تلاش مجدد
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-tg-border max-h-[65vh] overflow-auto" role="listbox" aria-label="فهرست پیام‌ها">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedId(m.id)}
                    role="option"
                    aria-selected={selectedId === m.id}
                    className={`w-full text-right px-4 py-3 flex flex-col gap-1 transition hover:bg-tg-hover ${selectedId === m.id ? "bg-tg-accent/10" : ""} ${!m.seen ? "bg-amber-500/5" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${!m.seen ? "font-bold text-tg-text" : "font-medium text-tg-text"}`}>
                        {m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address}
                      </span>
                      {!m.seen && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="خوانده‌نشده" />}
                    </span>
                    <span className="truncate text-sm font-medium text-tg-text">{m.subject}</span>
                    <span className="truncate text-xs text-tg-secondary">{m.snippet ?? ""}</span>
                    <time className="text-[11px] text-tg-secondary" dateTime={m.date}>
                      {formatJalaliDateTime(m.date)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Detail */}
        <Card>
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <Mail className="h-8 w-8 text-tg-secondary/50" />
              <p className="text-sm font-medium text-tg-text">پیامی انتخاب نشده است</p>
              <p className="text-xs text-tg-secondary">برای مشاهده جزئیات، یک پیام را از فهرست انتخاب کنید.</p>
            </div>
          ) : (
            <article>
              <h2 className="text-base font-bold text-tg-text">{selected.subject}</h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tg-secondary">
                <span>از: {selected.from.name ? `${selected.from.name} <${selected.from.address}>` : selected.from.address}</span>
                <span>به: {selected.account}@litecombomovie.ir</span>
                <time dateTime={selected.date}>{formatJalaliDateTime(selected.date)}</time>
              </div>
              <hr className="my-4 border-tg-border" />
              {selected.html ? (
                <div className="prose prose-sm max-w-none text-tg-text" dangerouslySetInnerHTML={{ __html: selected.html }} />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-tg-text">{selected.text ?? "(بدون محتوا)"}</pre>
              )}
              <div className="mt-6 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCompose({
                      to: selected.from.address,
                      subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
                      text: `\n\n---\nدر ${formatJalaliDateTime(selected.date)} ${selected.from.address} نوشت:\n${selected.text ?? ""}`,
                    });
                    setComposeOpen(true);
                  }}
                >
                  پاسخ
                </Button>
              </div>
            </article>
          )}
        </Card>
      </div>

      {/* Compose dialog */}
      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="ارسال ایمیل"
        footer={
          <>
            <Button variant="secondary" onClick={() => setComposeOpen(false)}>
              انصراف
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? "در حال ارسال..." : "ارسال"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <Label>از</Label>
            <Select value={account} onChange={(e) => setAccount(e.target.value as MailAccount)}>
              <option value="info">info@litecombomovie.ir</option>
              <option value="support">support@litecombomovie.ir</option>
            </Select>
          </div>
          <div>
            <Label>به</Label>
            <Input type="email" required value={compose.to} onChange={(e) => setCompose((s) => ({ ...s, to: e.target.value }))} placeholder="recipient@example.com" dir="ltr" />
          </div>
          <div>
            <Label>موضوع</Label>
            <Input required value={compose.subject} onChange={(e) => setCompose((s) => ({ ...s, subject: e.target.value }))} placeholder="موضوع پیام" />
          </div>
          <div>
            <Label>متن پیام</Label>
            <Textarea rows={6} required value={compose.text} onChange={(e) => setCompose((s) => ({ ...s, text: e.target.value }))} placeholder="متن ایمیل..." />
          </div>
          {sendError && <p className="text-xs text-rose-600" role="alert">{sendError}</p>}
          {sendOk && <p className="text-xs text-emerald-600">{sendOk}</p>}
          <p className="text-[11px] text-tg-secondary">پیام از طریق {account}@litecombomovie.ir ارسال می‌شود و یک نسخه در پوشه پیام‌های ارسال‌شده ذخیره خواهد شد.</p>
        </form>
      </Modal>
    </div>
  );
}
