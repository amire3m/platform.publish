"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { useToast } from "@/components/providers";
import type { PublicAccountDto } from "@/lib/accounts/public";

interface Props {
  account: PublicAccountDto;
  onChanged: () => void;
}

export function InstagramBrowserSessionForm({ account, onChanged }: Props) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [verify, setVerify] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setSaving(true);
    setVerify(null);
    try {
      const text = await file.text();
      const res = await fetch(`/api/accounts/${account.id}/instagram-session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storageState: text }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error ?? "آپلود ناموفق بود.", "error");
      const v = json.data?.verify as { ok: boolean; detail: string } | undefined;
      setVerify(v ? `${v.ok ? "✓" : "⚠"} ${v.detail}` : null);
      showToast(v?.ok ? "سشن مرورگر ذخیره و تأیید شد." : "سشن ذخیره شد (اعتبارسنجی: " + (v?.detail ?? "نامشخص") + ").", v?.ok ? "success" : "error");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/instagram-session`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) return showToast(json.error ?? "حذف ناموفق بود.", "error");
      showToast("سشن مرورگر حذف شد.", "success");
      setVerify(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const has = Boolean(account.hasBrowserSession);

  return (
    <details className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-2.5">
      <summary className="cursor-pointer text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300">
        اینستاگرام مرورگری (بدون فیسبوک) {has ? "✓ سشن دارد" : "— بدون سشن"}
      </summary>
      <p className="mt-1 text-[11px] leading-relaxed text-tg-secondary">
        storageState.json مرورگر خودت (از <code className="rounded bg-tg-hover px-1">npx playwright codegen</code> یا export دستی) را آپلود کن. فقط ریلز با این روش منتشر می‌شود.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="min-h-[40px] text-xs" />
        <div className="flex gap-1.5">
          <Button size="sm" onClick={upload} disabled={!file || saving} className="min-h-[36px] flex-1 text-xs">
            {saving ? "در حال آپلود…" : "آپلود سشن"}
          </Button>
          {has && (
            <Button size="sm" variant="secondary" onClick={remove} disabled={saving} className="min-h-[36px] text-xs">
              حذف سشن
            </Button>
          )}
        </div>
        {verify && <p className="text-[11px] text-tg-secondary">{verify}</p>}
      </div>
    </details>
  );
}
