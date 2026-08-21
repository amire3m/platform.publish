"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button, Card, EmptyState, Select } from "@/components/ui";
import { useToast } from "@/components/providers";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Account {
  id: string;
  platform: string;
  displayName: string;
  connectionStatus: string;
}

interface Snapshot {
  id: string;
  dateJalali: string;
  views: number;
  followersOrSubscribers: number;
  engagementRate: string;
}

export default function AnalyticsPage() {
  const { data: accountsData } = useSWR<{ ok: boolean; data: Account[] }>("/api/accounts", fetcher);
  const accounts = accountsData?.data ?? [];
  const [accountId, setAccountId] = useState("");
  const { showToast } = useToast();

  const { data: snapshotsData } = useSWR<{ ok: boolean; data: Snapshot[] }>(
    accountId ? `/api/analytics/account/${accountId}` : null,
    fetcher,
  );
  const snapshots = (snapshotsData?.data ?? []).slice().reverse();

  async function syncAll() {
    const res = await fetch("/api/analytics/sync", { method: "POST" });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast(`همگام‌سازی برای ${json.data.attempted} حساب متصل انجام شد. ${json.data.note}`, "info");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">آنالیز عملکرد</h1>
          <p className="text-sm text-tg-secondary">آمار واقعی فقط برای حساب‌های متصل رسمی نمایش داده می‌شود</p>
        </div>
        <div className="flex gap-2">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="max-w-[220px]">
            <option value="">انتخاب کانال/پیج</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={syncAll}>
            <RefreshCw className="h-4 w-4" />
            همگام‌سازی
          </Button>
          <a href="/api/analytics/export">
            <Button variant="secondary">
              <Download className="h-4 w-4" />
              خروجی CSV
            </Button>
          </a>
        </div>
      </div>

      {!accountId && <EmptyState title="یک کانال یا پیج انتخاب کنید" />}

      {accountId && snapshots.length === 0 && (
        <EmptyState
          title="داده تحلیلی موجود نیست"
          description="این حساب هنوز Snapshot تحلیلی ندارد؛ برای حساب‌های آزمایشی داده واقعی وجود ندارد."
        />
      )}

      {accountId && snapshots.length > 0 && (
        <Card>
          <h2 className="mb-4 font-semibold">روند بازدید</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={snapshots}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dateJalali" reversed />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="views" stroke="#3390ec" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
