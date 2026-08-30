"use client";
import { useState } from "react";
import useSWR from "swr";
import { Palette, Plus, Trash2, Check } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/providers";
import { liveFetcher } from "./LiveTab";

interface SceneItem {
  kind: "image" | "text" | "pip";
  value: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  scale?: number;
  opacity?: number;
}

interface Scene {
  name: string;
  items: SceneItem[];
}

interface LiveSettings {
  scenes: Scene[];
  activeSceneName?: string;
}

const KIND_FA: Record<SceneItem["kind"], string> = { image: "تصویر/PNG", text: "متن (لاتین)", pip: "PiP (m3u8)" };
const POS_FA: Record<SceneItem["position"], string> = {
  "top-left": "بالا چپ", "top-right": "بالا راست", "bottom-left": "پایین چپ", "bottom-right": "پایین راست",
};
const SCALE_FA: Record<string, string> = { "0.2": "کوچک (۲۰٪)", "0.33": "متوسط (۳۳٪)", "0.5": "بزرگ (۵۰٪)" };

const emptyItem: SceneItem = { kind: "image", value: "", position: "top-right", scale: 0.2, opacity: 1 };

export default function ScenesTab() {
  const { showToast } = useToast();
  const { data, mutate } = useSWR<LiveSettings>("/api/live/settings", liveFetcher, { refreshInterval: 60000 });
  const [name, setName] = useState("");
  const [items, setItems] = useState<SceneItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function save(scenes: Scene[], activeSceneName?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/live/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, activeSceneName }),
      });
      const resp = await res.json();
      if (!res.ok || !resp.ok) throw new Error(resp.error ?? "خطا");
      showToast("ذخیره شد.", "success");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  function setItem(idx: number, patch: Partial<SceneItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
          <Palette className="h-4 w-4 text-tg-accent" />
          صحنه جدید
          <span className="text-[11px] font-normal text-tg-secondary">(فقط حالت انکود 720p اعمال می‌شود)</span>
        </h2>
        <div>
          <label className="text-xs font-medium text-tg-secondary">نام صحنه</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً «پخش با لوگو»" className="mt-1 max-w-xs" />
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid gap-2 rounded-lg border border-tg-border p-2 md:grid-cols-12">
              <Select value={it.kind} onChange={(e) => setItem(idx, { kind: e.target.value as SceneItem["kind"] })} className="md:col-span-2">
                {Object.entries(KIND_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <Input
                value={it.value}
                onChange={(e) => setItem(idx, { value: e.target.value })}
                placeholder={it.kind === "image" ? "/opt/emro/logo.png" : it.kind === "pip" ? "https://tv/live.m3u8" : "LIVE — انگلیسی/عدد"}
                dir="ltr"
                className="md:col-span-4"
              />
              <Select value={it.position} onChange={(e) => setItem(idx, { position: e.target.value as SceneItem["position"] })} className="md:col-span-2">
                {Object.entries(POS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              {it.kind !== "text" ? (
                <Select value={String(it.scale ?? 0.33)} onChange={(e) => setItem(idx, { scale: Number(e.target.value) })} className="md:col-span-2">
                  {Object.entries(SCALE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              ) : <span className="md:col-span-2" />}
              <Button size="sm" variant="danger" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))} className="md:col-span-2 min-h-[34px]">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setItems((a) => [...a, { ...emptyItem }])} disabled={!name.trim()} className="min-h-[38px]">
            <Plus className="h-4 w-4" /> افزودن لایه
          </Button>
          <Button
            onClick={async () => {
              const scenes = [...(data?.scenes ?? []), { name: name.trim(), items }];
              await save(scenes);
              setName(""); setItems([]);
            }}
            disabled={busy || !name.trim() || items.length === 0}
            className="min-h-[38px]"
          >
            <Check className="h-4 w-4" /> ذخیره صحنه
          </Button>
        </div>
        <p className="text-[11px] text-tg-secondary">
          نکته: متن فارسی را به‌صورت تصویر PNG آپلود و با نوع «تصویر/PNG» اضافه کنید (drawtext فارسی را درست رندر نمی‌کند). لایه PiP مصرف CPU دارد.
        </p>
      </Card>

      <div className="space-y-2">
        {(data?.scenes ?? []).map((s) => {
          const active = data?.activeSceneName === s.name;
          return (
            <Card key={s.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-tg-text">
                  {s.name}
                  {active && <span className="mr-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700">پیش‌فرض</span>}
                </p>
                <p className="text-[11px] text-tg-secondary">
                  {s.items.map((it) => `${KIND_FA[it.kind]} (${POS_FA[it.position]})`).join(" · ") || "بدون لایه"}
                </p>
              </div>
              <div className="flex gap-1.5">
                {!active && (
                  <Button size="sm" variant="secondary" onClick={() => save(data?.scenes ?? [], s.name)} disabled={busy} className="min-h-[34px]">
                    پیش‌فرض
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => save((data?.scenes ?? []).filter((x) => x.name !== s.name))} disabled={busy} className="min-h-[34px]">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
        {data && (data.scenes ?? []).length === 0 && (
          <Card><p className="py-6 text-center text-sm text-tg-secondary">هنوز صحنه‌ای نساخته‌اید — لوگوی قبلی به‌صورت خودکار به یک صحنه «پیش‌فرض» تبدیل می‌شود.</p></Card>
        )}
      </div>
    </div>
  );
}
