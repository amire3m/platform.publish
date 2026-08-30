"use client";
import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/providers";
import { parseJsonResponse } from "@/lib/client/http";
import { liveFetcher } from "./LiveTab";

interface ChannelPublic {
  id: string;
  name: string;
  provider: string;
  rtmpUrl: string;
  isActive: boolean;
}

export default function ChannelsTab() {
  const { showToast } = useToast();
  const { data, mutate } = useSWR<ChannelPublic[]>("/api/live/channels", liveFetcher, { refreshInterval: 30000 });
  const [name, setName] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [streamKey, setStreamKey] = useState("");
  const [provider, setProvider] = useState("youtube");
  const [busy, setBusy] = useState(false);

  async function call(method: string, body?: Record<string, unknown>, query = "") {
    setBusy(true);
    try {
      const res = await fetch(`/api/live/channels${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const resp = await parseJsonResponse<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !resp.ok) throw new Error(resp.error ?? "خطا");
      showToast("انجام شد.", "success");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-tg-text">کانال جدید</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-tg-secondary">نام کانال</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً کانال اصلی" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-tg-secondary">نوع</label>
            <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1">
              <option value="youtube">یوتیوب</option>
              <option value="custom">سرور RTMP دلخواه</option>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-tg-secondary">RTMP URL</label>
            <Input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} className="mt-1" dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-medium text-tg-secondary">کلید استریم</label>
            <Input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} type="password" className="mt-1" dir="ltr" />
          </div>
        </div>
        <Button
          onClick={async () => {
            await call("POST", { name, rtmpUrl, streamKey, provider });
            setName(""); setStreamKey("");
          }}
          disabled={busy || !name.trim() || !streamKey.trim()}
          className="min-h-[40px]"
        >
          <Plus className="h-4 w-4" /> ذخیره کانال
        </Button>
        <p className="text-[11px] text-tg-secondary">کلید استریم با AES-256-GCM رمزنگاری و هرگز نمایش داده نمی‌شود.</p>
      </Card>

      <div className="space-y-2">
        {(data ?? []).map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-tg-text">
                {c.name}
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] ${c.isActive ? "bg-emerald-500/15 text-emerald-700" : "bg-tg-hover text-tg-secondary"}`}>
                  {c.isActive ? "فعال" : "غیرفعال"}
                </span>
              </p>
              <p className="truncate text-[11px] text-tg-secondary" dir="ltr">{c.rtmpUrl}</p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => call("PATCH", { id: c.id, isActive: !c.isActive })} disabled={busy} className="min-h-[34px]">
                <RefreshCw className="h-3.5 w-3.5" />
                {c.isActive ? "غیرفعال" : "فعال"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => call("DELETE", undefined, `?id=${c.id}`)} disabled={busy} className="min-h-[34px]">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
        {data && data.length === 0 && <Card><p className="py-6 text-center text-sm text-tg-secondary">هنوز کانالی ذخیره نشده است.</p></Card>}
      </div>
    </div>
  );
}
