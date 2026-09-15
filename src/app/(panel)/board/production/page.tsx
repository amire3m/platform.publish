"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { PRODUCTION_STATUSES } from "@/lib/board/channels";
import { nextProductionId, statusLabel, useProduction } from "@/lib/board/production";
import type { ProductionItem, ProductionStatus } from "@/lib/board/types";
import { DataTable, Field, BoardSelect } from "@/components/board/ui";
import { DemoBadge, fmt } from "@/components/board/badges";

type View = "table" | "cards" | "kanban";

const EMPTY: ProductionItem = {
  id: "", project: "", program: "", channel: "زاویه نو", contentType: "",
  episodes: 1, editStatus: "not_started", progress: 0, reviewStatus: "",
  licenseStatus: "", publishStatus: "", owner: "", startDate: "", etaDate: "", notes: "",
};

export default function BoardProductionPage() {
  const { items, loaded, upsert, remove } = useProduction();
  const [view, setView] = useState<View>("table");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProductionItem | null>(null);
  const [form, setForm] = useState<ProductionItem>(EMPTY);

  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return items;
    return items.filter((p) => `${p.project} ${p.program} ${p.channel} ${p.owner}`.includes(needle));
  }, [items, q]);

  function openNew() {
    setForm({ ...EMPTY, id: nextProductionId() });
    setEditing({ ...EMPTY, id: "new" });
  }

  function openEdit(item: ProductionItem) {
    setForm({ ...item });
    setEditing(item);
  }

  function save() {
    if (!form.project.trim()) return;
    upsert(form.id === "new" ? { ...form, id: nextProductionId() } : form);
    setEditing(null);
  }

  const byStatus = useMemo(() => {
    const map = new Map<string, ProductionItem[]>();
    for (const s of PRODUCTION_STATUSES) map.set(s.id, []);
    for (const p of filtered) {
      const arr = map.get(p.editStatus) ?? [];
      arr.push(p);
      map.set(p.editStatus, arr);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">وضعیت تولید و تدوین</h2>
        <DemoBadge />
        <span className="mr-auto flex gap-1">
          {(["table", "cards", "kanban"] as View[]).map((v) => (
            <Button key={v} variant={view === v ? "primary" : "secondary"} size="sm" onClick={() => setView(v)} className="min-h-[36px]">
              {v === "table" ? "جدول" : v === "cards" ? "کارت" : "کانبان"}
            </Button>
          ))}
          <Button size="sm" onClick={openNew} className="min-h-[36px]">
            + پروژه
          </Button>
        </span>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو: پروژه، برنامه، کانال، مسئول..." className="min-h-[44px] w-full max-w-md rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />

      {view === "table" && (
        <Card>
          <DataTable
            rows={filtered}
            columns={[
              { key: "project", label: "پروژه", render: (r) => r.project, sortValue: (r) => r.project },
              { key: "channel", label: "کانال", render: (r) => r.channel },
              { key: "progress", label: "پیشرفت", render: (r) => <span className="tabular-nums">{fmt(r.progress)}٪</span>, sortValue: (r) => r.progress },
              { key: "status", label: "وضعیت تدوین", render: (r) => statusLabel(r.editStatus) },
              { key: "eta", label: "انتشار", render: (r) => r.etaDate || "—", sortValue: (r) => r.etaDate },
              { key: "owner", label: "مسئول", render: (r) => r.owner || "—" },
              {
                key: "actions", label: "", render: (r) => (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => openEdit(r)} className="text-xs text-tg-accent hover:underline">ویرایش</button>
                    <button type="button" onClick={() => remove(r.id)} className="text-xs text-rose-600 hover:underline">حذف</button>
                  </span>
                ),
              },
            ]}
            searchKeys={[(r) => `${r.project} ${r.program} ${r.channel}`]}
          />
        </Card>
      )}

      {view === "cards" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-tg-text">{p.project}</p>
                <span className="shrink-0 rounded-full bg-tg-hover px-2 py-0.5 text-[11px] text-tg-secondary">{statusLabel(p.editStatus)}</span>
              </div>
              <p className="text-xs text-tg-secondary">{p.program} · {p.channel} · {p.episodes} قسمت</p>
              <div className="h-2 overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full rounded-full bg-tg-accent" style={{ width: `${Math.min(100, p.progress)}%` }} />
              </div>
              <p className="text-xs text-tg-secondary">بازبینی: {p.reviewStatus || "—"} · مجوز: {p.licenseStatus || "—"}</p>
              <p className="text-xs text-tg-secondary">انتشار: {p.publishStatus || "—"} · تحویل: {p.etaDate || "—"}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(p)} className="text-xs text-tg-accent hover:underline">ویرایش</button>
                <button type="button" onClick={() => remove(p.id)} className="text-xs text-rose-600 hover:underline">حذف</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {view === "kanban" && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {PRODUCTION_STATUSES.filter((s) => ["not_started", "editing", "reviewing", "ready", "published"].includes(s.id)).map((s) => (
            <div key={s.id} className="rounded-xl border border-tg-border bg-tg-surface/50 p-2">
              <p className="px-1 py-1 text-xs font-bold text-tg-text">{s.label} ({byStatus.get(s.id)?.length ?? 0})</p>
              <div className="space-y-2">
                {(byStatus.get(s.id) ?? []).map((p) => (
                  <button key={p.id} type="button" onClick={() => openEdit(p)} className="w-full rounded-lg bg-tg-surface p-2 text-right shadow-sm hover:ring-1 hover:ring-tg-accent">
                    <p className="truncate text-xs font-medium text-tg-text">{p.project}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-tg-secondary">{p.channel} · {fmt(p.progress)}٪</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setEditing(null)}>
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-tg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-tg-text">{editing.id === "new" ? "پروژه جدید" : "ویرایش پروژه"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="نام پروژه *">
                <input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="برنامه / اثر">
                <input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="کانال مقصد">
                <input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="نوع محتوا">
                <input value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="تعداد قسمت">
                <input type="number" min={1} value={form.episodes} onChange={(e) => setForm({ ...form, episodes: Number(e.target.value) || 1 })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="وضعیت تدوین">
                <BoardSelect value={form.editStatus} onChange={(v) => setForm({ ...form, editStatus: v as ProductionStatus })} ariaLabel="وضعیت تدوین" options={PRODUCTION_STATUSES.map((s) => ({ value: s.id, label: s.label }))} />
              </Field>
              <Field label="درصد پیشرفت">
                <input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="مسئول پروژه">
                <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="وضعیت بازبینی">
                <input value={form.reviewStatus} onChange={(e) => setForm({ ...form, reviewStatus: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="وضعیت مجوز">
                <input value={form.licenseStatus} onChange={(e) => setForm({ ...form, licenseStatus: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="وضعیت انتشار">
                <input value={form.publishStatus} onChange={(e) => setForm({ ...form, publishStatus: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <Field label="پیش‌بینی انتشار">
                <input type="date" value={form.etaDate} onChange={(e) => setForm({ ...form, etaDate: e.target.value })} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="توضیحات">
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="min-h-[64px] rounded-lg border border-tg-border bg-tg-surface px-3 py-2 text-sm text-tg-text" />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={save} disabled={!form.project.trim()} className="min-h-[44px] flex-1">ذخیره</Button>
              <Button variant="secondary" onClick={() => setEditing(null)} className="min-h-[44px]">انصراف</Button>
            </div>
          </div>
        </div>
      )}
      {!loaded && <p className="text-xs text-tg-secondary">در حال بارگذاری...</p>}
    </div>
  );
}
