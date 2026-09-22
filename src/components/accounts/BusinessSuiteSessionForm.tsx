"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/providers";
import type { PublicAccountDto } from "@/lib/accounts/public";

export function BusinessSuiteSessionForm({ account, onChanged }: { account: PublicAccountDto; onChanged: () => void }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"file" | "cookies" | "login">("file");
  const [file, setFile] = useState<File | null>(null);
  const [cUser, setCUser] = useState("");
  const [xs, setXs] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verify, setVerify] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/accounts/${account.id}/business-suite`).then((r) => r.json()).then((j) => {
      if (j.ok && j.data?.hasSession) setHealth("سشن موجود");
    }).catch(() => {});
  }, [account.id]);

  function handleVerify(json: { ok: boolean; data?: { verify?: { ok: boolean; detail: string } }; error?: string }) {
    if (!json.ok) {
      const need = (json as { code?: string }).code === "NEED_CODE";
      if (need) { setNeedCode(true); showToast("کد تأیید را وارد کنید.", "error"); return; }
      showToast(json.error ?? "ناموفق بود.", "error"); return;
    }
    const v = json.data?.verify as { ok: boolean; detail: string } | undefined;
    setVerify(v ? `${v.ok ? "✓" : "⚠"} ${v.detail}` : null);
    showToast(v?.ok ? "سشن Business Suite ذخیره و تأیید شد." : "ذخیره شد.", v?.ok ? "success" : "error");
    setNeedCode(false); onChanged();
  }

  async function uploadFile() {
    if (!file) return;
    setSaving(true);
    try { const text = await file.text(); const res = await fetch(`/api/accounts/${account.id}/business-suite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storageState: text }) }); handleVerify(await res.json()); } finally { setSaving(false); }
  }
  async function uploadCookies() {
    if (!cUser.trim()) return showToast("c_user الزامی است.", "error");
    setSaving(true);
    try { const res = await fetch(`/api/accounts/${account.id}/business-suite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "cookies", c_user: cUser.trim(), xs: xs.trim() }) }); handleVerify(await res.json()); } finally { setSaving(false); }
  }
  async function login() {
    if (!email.trim() || !password) return showToast("ایمیل و رمز را وارد کنید.", "error");
    setSaving(true);
    try { const res = await fetch(`/api/accounts/${account.id}/business-suite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "credentials", email: email.trim(), password, code: code.trim() || undefined }) }); handleVerify(await res.json()); } finally { setSaving(false); }
  }
  async function remove() {
    setSaving(true);
    try { const res = await fetch(`/api/accounts/${account.id}/business-suite`, { method: "DELETE" }); const j = await res.json(); if (!j.ok) return showToast(j.error, "error"); showToast("سشن حذف شد.", "success"); setVerify(null); onChanged(); } finally { setSaving(false); }
  }

  const has = Boolean((account as unknown as { capabilities?: Record<string, unknown> })?.capabilities?.businessSuite);

  return (
    <details className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5" open={has}>
      <summary className="cursor-pointer text-xs font-bold text-sky-700 dark:text-sky-300">Business Suite (هر پیج جدا) {has ? "✓ سشن دارد" : "— بدون سشن"}</summary>
      <p className="mt-1 text-[11px] text-tg-secondary">هر ۵ پیج جدا لاگین به business.facebook.com — ۳ روش: فایل / کوکی / ورود مستقیم. فقط از business.facebook.com استفاده می‌شود.</p>
      <div className="mt-2 flex gap-1">
        {(["file","cookies","login"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${tab===t ? "bg-sky-600 text-white" : "bg-tg-hover text-tg-secondary"}`}>{t==="file"?"فایل":t==="cookies"?"کوکی":"ورود"}</button>
        ))}
      </div>
      {tab==="file" && (
        <div className="mt-2 flex flex-col gap-2">
          <Input type="file" accept=".json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="min-h-[40px] text-xs" />
          <Button size="sm" onClick={uploadFile} disabled={!file || saving} className="min-h-[36px] text-xs">{saving?"…":"آپلود فایل"}</Button>
        </div>
      )}
      {tab==="cookies" && (
        <div className="mt-2 flex flex-col gap-2">
          <Input value={cUser} onChange={(e) => setCUser(e.target.value)} placeholder="c_user *" dir="ltr" className="min-h-[40px] font-mono text-xs" />
          <Input value={xs} onChange={(e) => setXs(e.target.value)} placeholder="xs (اختیاری)" dir="ltr" className="min-h-[40px] font-mono text-xs" />
          <Button size="sm" onClick={uploadCookies} disabled={saving} className="min-h-[36px] text-xs">{saving?"…":"ذخیره کوکی"}</Button>
        </div>
      )}
      {tab==="login" && (
        <div className="mt-2 flex flex-col gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ایمیل Business Suite" dir="ltr" className="min-h-[40px] text-xs" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" dir="ltr" className="min-h-[40px] text-xs" />
          {needCode && <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد ۶رقمی" dir="ltr" className="min-h-[40px] font-mono text-xs" />}
          <Button size="sm" onClick={login} disabled={saving} className="min-h-[36px] text-xs">{saving?"در حال ورود…":needCode?"تأیید کد":"ورود و ذخیره"}</Button>
          <p className="text-[10px] text-tg-secondary">رمز فقط برای ساخت سشن استفاده و فراموش می‌شود.</p>
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        {has && <Button size="sm" variant="secondary" onClick={remove} disabled={saving} className="min-h-[36px] flex-1 text-xs">حذف سشن</Button>}
      </div>
      {health && <p className="mt-1 text-[11px] text-tg-secondary">{health}</p>}
      {verify && <p className="mt-1 text-[11px] text-tg-secondary">{verify}</p>}
    </details>
  );
}
