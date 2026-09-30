"use client";

import { Select, Label } from "@/components/ui";
import type { PublicAccountDto } from "@/lib/accounts/public";

interface Props {
  label: string;
  platform: "youtube" | "instagram";
  accounts: PublicAccountDto[];
  value: string;
  onChange: (accountId: string) => void;
  hint?: string;
}

/** Destination account picker (YouTube page / Instagram page) with connection status. */
export function AccountPicker({ label, platform, accounts, value, onChange, hint }: Props) {
  const list = accounts.filter((a) => a.platform === platform);
  const selected = list.find((a) => a.id === value);
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 text-xs">
        <option value="">— انتخاب کنید —</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName || a.username} {a.connectionStatus !== "connected" ? "(متصل نیست)" : ""}
          </option>
        ))}
      </Select>
      {hint && <p className="mt-1 text-[10px] text-tg-secondary">{hint}</p>}
      {!selected && list.length > 0 && (
        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">پیش‌فرض کانال در دسترس نیست؛ یک صفحه انتخاب کنید.</p>
      )}
      {list.length === 0 && (
        <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">هیچ حساب {platform === "youtube" ? "یوتیوب" : "اینستاگرام"} متصلی وجود ندارد.</p>
      )}
    </div>
  );
}
