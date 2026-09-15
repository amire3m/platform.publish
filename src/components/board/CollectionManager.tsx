"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { DataTable, Field, BoardSelect } from "@/components/board/ui";
import { DemoBadge } from "@/components/board/badges";

export function useCollection<T extends { id: string }>(key: string, seed: T[]) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed);
          setLoaded(true);
          return;
        }
      }
    } catch {}
    setItems(seed);
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {}
  }, [items, loaded, key]);

  const upsert = useCallback((item: T) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === item.id);
      if (i === -1) return [...prev, item];
      const next = [...prev];
      next[i] = item;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { items, loaded, upsert, remove };
}

export interface CollectionField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  options?: string[];
  span?: boolean;
  required?: boolean;
}

export function CollectionManager<T extends { id: string }>({
  title,
  description,
  storageKey,
  seed,
  fields,
  columns,
  newLabel = "+ مورد جدید",
  toRecord,
}: {
  title: string;
  description?: string;
  storageKey: string;
  seed: T[];
  fields: CollectionField[];
  columns: Array<{ key: string; label: string; render: (r: T) => React.ReactNode }>;
  newLabel?: string;
  toRecord?: (form: Record<string, string>) => T;
}) {
  const { items, upsert, remove } = useCollection<T>(storageKey, seed);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  function openNew() {
    const blank: Record<string, string> = { id: `B-${Date.now().toString(36)}` };
    for (const f of fields) blank[f.key] = "";
    setForm(blank);
    setEditing({ ...blank } as unknown as T);
  }

  function openEdit(item: T) {
    const rec = item as unknown as Record<string, unknown>;
    const blank: Record<string, string> = { id: item.id };
    for (const f of fields) blank[f.key] = String(rec[f.key] ?? "");
    setForm(blank);
    setEditing(item);
  }

  function save() {
    upsert(toRecord ? toRecord(form) : ({ ...form } as unknown as T));
    setEditing(null);
  }

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">{title}</h2>
        <DemoBadge />
        <span className="mr-auto">
          <Button size="sm" onClick={openNew} className="min-h-[36px]">
            {newLabel}
          </Button>
        </span>
      </div>
      {description && <p className="max-w-3xl text-sm leading-6 text-tg-secondary">{description}</p>}
      <Card>
        <DataTable
          rows={items}
          columns={[
            ...columns,
            {
              key: "actions",
              label: "",
              render: (r: T) => (
                <span className="flex gap-2">
                  <button type="button" onClick={() => openEdit(r)} className="text-xs text-tg-accent hover:underline">
                    ویرایش
                  </button>
                  <button type="button" onClick={() => remove(r.id)} className="text-xs text-rose-600 hover:underline">
                    حذف
                  </button>
                </span>
              ),
            },
          ]}
          searchKeys={fields.filter((f) => f.type === "text").map((f) => (r: T) => String((r as unknown as Record<string, unknown>)[f.key] ?? ""))}
        />
      </Card>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setEditing(null)}>
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-tg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-tg-text">{editing.id.startsWith("B-") && items.every((i) => i.id !== editing.id) ? "مورد جدید" : "ویرایش"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className={f.span ? "sm:col-span-2" : ""}>
                  <Field label={`${f.label}${f.required ? " *" : ""}`}>
                    {f.type === "select" ? (
                      <BoardSelect value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} ariaLabel={f.label} options={[{ value: "", label: "—" }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]} />
                    ) : f.type === "textarea" ? (
                      <textarea value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={2} className="min-h-[64px] rounded-lg border border-tg-border bg-tg-surface px-3 py-2 text-sm text-tg-text" />
                    ) : (
                      <input type={f.type === "date" ? "date" : "text"} value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="min-h-[44px] rounded-lg border border-tg-border bg-tg-surface px-3 text-sm text-tg-text" />
                    )}
                  </Field>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={save} className="min-h-[44px] flex-1">
                ذخیره
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)} className="min-h-[44px]">
                انصراف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
