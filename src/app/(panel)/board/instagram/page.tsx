"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { Field } from "@/components/board/ui";
import { DemoBadge, NeedsInput } from "@/components/board/badges";

const KEY = "board-report:instagram:v1";

interface IgSnapshot {
  followers: string;
  posts: string;
  engagement: string;
  updatedAt: string;
  notes: string;
}

const EMPTY: IgSnapshot = { followers: "", posts: "", engagement: "", updatedAt: "", notes: "" };

export default function BoardInstagramPage() {
  const [snap, setSnap] = useState<IgSnapshot>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IgSnapshot>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as IgSnapshot;
        setSnap(parsed);
        setDraft(parsed);
      }
    } catch {}
  }, []);

  function save() {
    const next = { ...draft, updatedAt: new Date().toISOString().slice(0, 10) };
    setSnap(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setEditing(false);
  }

  const hasData = Boolean(snap.followers || snap.posts || snap.engagement);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">گزارش خلاصه اینستاگرام</h2>
        <DemoBadge label="به‌زودی با داده واقعی" />
        <span className="mr-auto">
          <Button size="sm" variant="secondary" onClick={() => { setDraft(snap); setEditing(true); }} className="min-h-[36px]">
            ثبت / ویرایش آمار
          </Button>
        </span>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-tg-secondary">
        آمار اینستاگرام به‌صورت دستی وارد می‌شود. بخش مقایسه‌ای اینستاگرام در برابر یوتیوب پس از ثبت آمار فعال خواهد شد.
      </p>

      {!hasData && !editing && (
        <NeedsInput
          title="نیازمند تکمیل اطلاعات"
          description="هنوز آماری ثبت نشده است. با دکمه «ثبت / ویرایش آمار»، تعداد دنبال‌کننده، پست و نرخ تعامل را وارد کنید."
        />
      )}

      {hasData && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "دنبال‌کننده", value: snap.followers },
            { label: "تعداد پست", value: snap.posts },
            { label: "نرخ تعامل", value: snap.engagement },
          ].map((c) => (
            <Card key={c.label} className="text-center">
              <p className="text-xl font-black tabular-nums text-tg-text">{c.value || "—"}</p>
              <p className="mt-1 text-xs text-tg-secondary">{c.label}</p>
            </Card>
          ))}
        </div>
      )}

      {hasData && snap.notes && (
        <Card className="space-y-1">
          <h3 className="font-bold text-tg-text">یادداشت</h3>
          <p className="text-sm leading-6 text-tg-text">{snap.notes}</p>
          <p className="text-[11px] tabular-nums text-tg-secondary" dir="ltr">به‌روزرسانی: {snap.updatedAt}</p>
        </Card>
      )}

      <Card className="space-y-2">
        <h3 className="font-bold text-tg-text">مقایسه اینستاگرام در برابر یوتیوب</h3>
        <NeedsInput title="نیازمند تکمیل اطلاعات" description="پس از ثبت آمار اینستاگرام و بارگذاری CSV یوتیوب، مقایسه نرخ رشد و تعامل در این بخش نمایش داده می‌شود." />
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setEditing(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-tg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-tg-text">ثبت آمار اینستاگرام</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="دنبال‌کننده">
                <input value={draft.followers} onChange={(e) => setDraft({ ...draft, followers: e.target.value })} inputMode="numeric" className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="تعداد پست">
                <input value={draft.posts} onChange={(e) => setDraft({ ...draft, posts: e.target.value })} inputMode="numeric" className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="نرخ تعامل (٪)">
                <input value={draft.engagement} onChange={(e) => setDraft({ ...draft, engagement: e.target.value })} inputMode="decimal" className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="یادداشت">
                  <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className="min-h-[64px] rounded-lg border border-tg-border bg-tg-surface px-3 py-2 text-sm text-tg-text" />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={save} className="min-h-[44px] flex-1">ذخیره</Button>
              <Button variant="secondary" onClick={() => setEditing(false)} className="min-h-[44px]">انصراف</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
