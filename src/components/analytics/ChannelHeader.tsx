"use client";

import { MAIN_REPORT_ALIAS } from "@/lib/accounts/organization";

export function ChannelHeader({ account, isAggregated }: {
  account: { id: string; displayName: string; username: string; profileImage: string | null; externalAccountId: string | null } | null;
  isAggregated: boolean;
}) {
  if (isAggregated) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-tg-border bg-tg-surface p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tg-accent-soft text-tg-accent font-bold">Em</div>
        <div>
          <p className="font-bold text-tg-text">{MAIN_REPORT_ALIAS} — همه کانال‌ها</p>
          <p className="text-xs text-tg-secondary">تجمیع ۴ کانال موسسه امام روح‌الله</p>
        </div>
      </div>
    );
  }
  if (!account) return null;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-tg-border bg-tg-surface p-4">
      {account.profileImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.profileImage} alt={account.displayName} className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tg-hover text-tg-secondary font-bold">{account.displayName.slice(0,2)}</div>
      )}
      <div className="min-w-0">
        <p className="truncate font-bold text-tg-text">{account.displayName}</p>
        <p className="truncate text-xs text-tg-secondary">@{account.username} · {account.externalAccountId ?? ""}</p>
      </div>
    </div>
  );
}
