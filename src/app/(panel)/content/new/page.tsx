"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/providers";
import { JalaliDateTimePicker } from "@/components/JalaliDateTimePicker";
import { DEFAULT_CAPABILITY_CONFIG, type Platform } from "@/lib/capabilities";
import type { PublicAccountDto } from "@/lib/accounts/public";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Account = Pick<PublicAccountDto, "id" | "displayName" | "username" | "active"> & { platform: Platform };

interface TargetDraft {
  platform: Platform;
  accountId: string;
  contentType: string;
  privacyStatus: string;
}

const STEPS = ["فایل", "پلتفرم و حساب", "کپشن و هشتگ", "زمان‌بندی", "بازبینی و ثبت"];

export default function UploadWizardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: accountsData } = useSWR<{ ok: boolean; data: Account[] }>("/api/accounts", fetcher);
  const accounts = (accountsData?.data ?? []).filter((a) => a.active);

  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  const [targets, setTargets] = useState<TargetDraft[]>([]);
  const [finalStatus, setFinalStatus] = useState<"draft" | "in_review" | "scheduled">("in_review");
  const [scheduledAtUtc, setScheduledAtUtc] = useState<string>("");
  const [scheduledAtJalali, setScheduledAtJalali] = useState<string>("");

  function toggleTarget(account: Account) {
    setTargets((prev) => {
      const exists = prev.find((t) => t.accountId === account.id);
      if (exists) return prev.filter((t) => t.accountId !== account.id);
      const defaultType = account.platform === "youtube" ? "video" : "image";
      return [...prev, { platform: account.platform, accountId: account.id, contentType: defaultType, privacyStatus: "private" }];
    });
  }

  function updateTarget(accountId: string, patch: Partial<TargetDraft>) {
    setTargets((prev) => prev.map((t) => (t.accountId === accountId ? { ...t, ...patch } : t)));
  }

  async function submit() {
    if (files.length === 0) return showToast("ابتدا حداقل یک فایل انتخاب کنید.", "error");
    if (targets.length === 0) return showToast("حداقل یک پلتفرم/حساب مقصد انتخاب کنید.", "error");
    if (finalStatus === "scheduled" && !scheduledAtUtc) return showToast("زمان انتشار را انتخاب کنید.", "error");

    setUploading(true);
    setProgress(10);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      if (thumbnail) form.append("thumbnail", thumbnail);
      form.append(
        "metadata",
        JSON.stringify({
          title,
          description,
          caption,
          hashtags: hashtags.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)),
          platformTargets: targets.map((t) => ({
            platform: t.platform,
            accountId: t.accountId,
            contentType: t.contentType,
            publishAtJalali: finalStatus === "scheduled" ? scheduledAtJalali : null,
            publishAtUtc: finalStatus === "scheduled" ? scheduledAtUtc : null,
            fields: t.platform === "youtube" ? { privacyStatus: t.privacyStatus } : {},
          })),
          status: finalStatus,
          scheduledAtJalali: finalStatus === "scheduled" ? scheduledAtJalali : null,
          scheduledAtUtc: finalStatus === "scheduled" ? scheduledAtUtc : null,
        }),
      );

      const xhr = new XMLHttpRequest();
      const result = await new Promise<{ ok: boolean; data?: { content: { id: string } }; error?: string }>((resolve, reject) => {
        xhr.open("POST", "/api/content/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.min(95, Math.round((e.loaded / e.total) * 100)));
        };
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("پاسخ نامعتبر از سرور"));
          }
        };
        xhr.onerror = () => reject(new Error("خطا در ارتباط با سرور"));
        xhr.send(form);
      });

      setProgress(100);
      if (!result.ok || !result.data) {
        showToast(result.error ?? "آپلود ناموفق بود.", "error");
        return;
      }
      showToast("محتوا با موفقیت در تلگرام ذخیره شد.", "success");
      router.push(`/content/${result.data.content.id}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">ایجاد محتوای جدید</h1>
        <p className="text-sm text-tg-secondary">فایل ابتدا مستقیماً در گروه تلگرام ذخیره می‌شود</p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`rounded-full px-3 py-1 ${
              i === step
                ? "bg-tg-accent text-tg-accent-fg"
                : i < step
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-tg-hover text-tg-secondary"
            }`}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      <Card>
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label>فایل(های) اصلی (تصویر/ویدیو)</Label>
              <input
                type="file"
                multiple
                accept="video/*,image/*"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full rounded-lg border border-dashed border-tg-border p-4 text-sm"
              />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-tg-secondary">
                  {files.map((f) => (
                    <li key={f.name}>
                      {f.name} — {(f.size / (1024 * 1024)).toFixed(1)} مگابایت
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <Label>تامبنیل/کاور (اختیاری)</Label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border border-dashed border-tg-border p-4 text-sm"
              />
            </div>
            {uploading && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full bg-tg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Label>انتخاب حساب‌های مقصد</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((a) => {
                const selected = targets.some((t) => t.accountId === a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleTarget(a)}
                    className={`rounded-xl border p-3 text-right text-sm transition ${
                      selected
                        ? "border-tg-accent bg-tg-accent-soft"
                        : "border-tg-border hover:bg-tg-hover"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {a.platform === "youtube" ? (
                        <YoutubeIcon className="h-4 w-4 text-red-500" />
                      ) : (
                        <InstagramIcon className="h-4 w-4 text-fuchsia-500" />
                      )}
                      {a.displayName} <span className="text-xs text-tg-secondary/80">@{a.username}</span>
                    </span>
                  </button>
                );
              })}
              {accounts.length === 0 && <p className="text-sm text-tg-secondary">ابتدا از صفحه «کانال‌ها و پیج‌ها» یک حساب اضافه کنید.</p>}
            </div>

            {targets.map((t) => {
              const account = accounts.find((a) => a.id === t.accountId);
              const contentTypes = Object.keys(DEFAULT_CAPABILITY_CONFIG[t.platform].contentTypes);
              return (
                <div key={t.accountId} className="rounded-xl border border-tg-border p-3">
                  <p className="mb-2 text-xs font-semibold text-tg-text/75">{account?.displayName}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label>نوع محتوا</Label>
                      <Select value={t.contentType} onChange={(e) => updateTarget(t.accountId, { contentType: e.target.value })}>
                        {contentTypes.map((ct) => (
                          <option key={ct} value={ct}>
                            {DEFAULT_CAPABILITY_CONFIG[t.platform].contentTypes[ct].label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {t.platform === "youtube" && (
                      <div>
                        <Label>وضعیت انتشار</Label>
                        <Select value={t.privacyStatus} onChange={(e) => updateTarget(t.accountId, { privacyStatus: e.target.value })}>
                          <option value="private">خصوصی</option>
                          <option value="unlisted">لینک‌دار</option>
                          <option value="public">عمومی</option>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>عنوان</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان محتوا" />
            </div>
            <div>
              <Label>توضیحات (یوتیوب)</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>کپشن</Label>
              <Textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
            <div>
              <Label>هشتگ‌ها (با فاصله یا کاما جدا کنید)</Label>
              <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="خبر تحلیل ..." />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Label>وضعیت نهایی</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["draft", "ذخیره پیش‌نویس"],
                ["in_review", "ارسال برای تأیید"],
                ["scheduled", "زمان‌بندی"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFinalStatus(v as typeof finalStatus)}
                  className={`rounded-xl border p-3 text-sm ${
                    finalStatus === v ? "border-tg-accent bg-tg-accent-soft" : "border-tg-border"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {finalStatus === "scheduled" && (
              <div>
                <Label>تاریخ و ساعت انتشار (تقویم جلالی)</Label>
                <JalaliDateTimePicker
                  onChange={(utc, jalali) => {
                    setScheduledAtUtc(utc);
                    setScheduledAtJalali(jalali);
                  }}
                />
                <p className="mt-2 text-xs text-tg-secondary/80">زمان انتخاب‌شده: {scheduledAtJalali} (منطقه زمانی Asia/Tehran)</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <p>
              <strong>عنوان:</strong> {title || "—"}
            </p>
            <p>
              <strong>فایل‌ها:</strong> {files.map((f) => f.name).join("، ") || "—"}
            </p>
            <p>
              <strong>حساب‌های مقصد:</strong> {targets.map((t) => accounts.find((a) => a.id === t.accountId)?.displayName).join("، ") || "—"}
            </p>
            <p>
              <strong>وضعیت نهایی:</strong> {finalStatus}
            </p>
            {finalStatus === "scheduled" && (
              <p>
                <strong>زمان انتشار:</strong> {scheduledAtJalali}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            مرحله قبل
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>مرحله بعد</Button>
          ) : (
            <Button onClick={submit} disabled={uploading}>
              {uploading ? "در حال آپلود..." : "ثبت و ارسال به تلگرام"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
