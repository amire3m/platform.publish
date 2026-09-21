"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/providers";
import type { PublicAccountDto } from "@/lib/accounts/public";

interface Props {
  account: PublicAccountDto;
  onChanged: () => void;
}

export function InstagramBrowserSessionForm({ account, onChanged }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"file" | "cookies" | "login">("file");
  const [file, setFile] = useState<File | null>(null);
  const [sessionid, setSessionid] = useState("");
  const [csrftoken, setCsrftoken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verify, setVerify] = useState<string | null>(null);

  function handleVerify(json: { ok: boolean; data?: { verify?: { ok: boolean; detail: string } }; error?: string }) {
    if (!json.ok) {
      const need = (json as { code?: string }).code === "NEED_CODE";
      if (need) { setNeedCode(true); showToast("کد ۶رقمی اینستاگرام را وارد کنید.", "error"); return; }
      showToast(json.error ?? "ناموفق بود.", "error");
      return;
    }
    const v = json.data?.verify as { ok: boolean; detail: string } | undefined;
    setVerify(v ? `${v.ok ? "✓" : "⚠"} ${v.detail}` : null);
    showToast(v?.ok ? "سشن مرورگر ذخیره و تأیید شد." : "سشن ذخیره شد (اعتبارسنجی: " + (v?.detail ?? "نامشخص") + ").", v?.ok ? "success" : "error");
    setNeedCode(false);
    onChanged();
  }

  async function uploadFile() {
    if (!file) return;
    setSaving(true); setVerify(null);
    try {
      const text = await file.text();
      const res = await fetch(`/api/accounts/${account.id}/instagram-session`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storageState: text }),
      });
      handleVerify(await res.json());
    } finally { setSaving(false); }
  }

  async function uploadCookies() {
    if (!sessionid.trim()) { showToast("sessionid الزامی است.", "error"); return; }
    setSaving(true); setVerify(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/instagram-session`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "cookies", sessionid: sessionid.trim(), csrftoken: csrftoken.trim() }),
      });
      handleVerify(await res.json());
    } finally { setSaving(false); }
  }

  async function login() {
    if (!username.trim() || !password) { showToast("نام کاربری و رمز عبور را وارد کنید.", "error"); return; }
    setSaving(true); setVerify(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/instagram-session`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "credentials", username: username.trim(), password, code: code.trim() || undefined }),
      });
      handleVerify(await res.json());
    } finally { setSaving(false); }
  }

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/instagram-session`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) return showToast(json.error ?? "حذف ناموفق بود.", "error");
      showToast("سشن مرورگر حذف شد.", "success");
      setVerify(null); onChanged();
    } finally { setSaving(false); }
  }

  const has = Boolean(account.hasBrowserSession);
  const tabs: Array<{ id: "file" | "cookies" | "login"; label: string }> = [
    { id: "file", label: "فایل" },
    { id: "cookies", label: "کوکی" },
    { id: "login", label: "ورود" },
  ];

  return (
    <details className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-2.5">
      <summary className="cursor-pointer text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300">
        اینستاگرام مرورگری (بدون فیسبوک) {has ? "✓ سشن دارد" : "— بدون سشن"}
      </summary>
      <p className="mt-1 text-[11px] leading-relaxed text-tg-secondary">
        سه روش ورود — هر کدام راحت‌تر است. فقط ریلز با این روش منتشر می‌شود.
      </p>
      <div className="mt-2 flex gap-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${tab === t.id ? "bg-fuchsia-600 text-white" : "bg-tg-hover text-tg-secondary"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "file" && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[11px] text-tg-secondary">storageState.json (از <code className="rounded bg-tg-hover px-1">codegen</code>)</p>
          <Input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="min-h-[40px] text-xs" />
          <Button size="sm" onClick={uploadFile} disabled={!file || saving} className="min-h-[36px] text-xs">{saving ? "در حال آپلود…" : "آپلود فایل"}</Button>
        </div>
      )}

      {tab === "cookies" && (
        <div className="mt-2 flex flex-col gap-2">
          <Input value={sessionid} onChange={(e) => setSessionid(e.target.value)} placeholder="sessionid *" dir="ltr" className="min-h-[40px] font-mono text-xs" />
          <Input value={csrftoken} onChange={(e) => setCsrftoken(e.target.value)} placeholder="csrftoken (اختیاری)" dir="ltr" className="min-h-[40px] font-mono text-xs" />
          <Button size="sm" onClick={uploadCookies} disabled={saving} className="min-h-[36px] text-xs">{saving ? "در حال ذخیره…" : "ذخیره کوکی"}</Button>
        </div>
      )}

      {tab === "login" && (
        <div className="mt-2 flex flex-col gap-2">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="نام کاربری اینستاگرام" dir="ltr" className="min-h-[40px] text-xs" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" dir="ltr" className="min-h-[40px] text-xs" />
          {needCode && <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد ۶رقمی (۲FA)" dir="ltr" className="min-h-[40px] font-mono text-xs" />}
          <Button size="sm" onClick={login} disabled={saving} className="min-h-[36px] text-xs">{saving ? "در حال ورود…" : needCode ? "تأیید کد" : "ورود و ذخیره سشن"}</Button>
          <p className="text-[10px] text-tg-secondary">رمز عبور ذخیره نمی‌شود — فقط برای ساخت سشن استفاده و فراموش می‌شود.</p>
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        {has && <Button size="sm" variant="secondary" onClick={remove} disabled={saving} className="min-h-[36px] flex-1 text-xs">حذف سشن</Button>}
      </div>
      {verify && <p className="mt-1 text-[11px] text-tg-secondary">{verify}</p>}
    </details>
  );
}
