"use client";

import { useRef, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { downloadSvgAsPng } from "@/lib/board/store";

export function ChartCard({ title, hint, onPng, children }: { title: string; hint?: string; onPng?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-balance font-bold text-tg-text">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-tg-secondary">{hint}</p>}
        </div>
        {onPng && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const svg = ref.current?.querySelector("svg");
              if (svg) downloadSvgAsPng(svg, onPng).catch(() => {});
            }}
            aria-label="دانلود نمودار"
          >
            PNG
          </Button>
        )}
      </div>
      <div ref={ref} className="min-w-0" dir="ltr">
        {children}
      </div>
    </Card>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchKeys,
  pageSize = 10,
}: {
  rows: readonly T[];
  columns: Array<Column<T>>;
  searchKeys?: Array<(row: T) => string>;
  pageSize?: number;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);

  let out = [...rows];
  const needle = q.trim();
  if (needle && searchKeys) out = out.filter((r) => searchKeys.some((k) => k(r).includes(needle)));
  const col = columns.find((c) => c.key === sortKey);
  if (col?.sortValue) out.sort((a, b) => {
    const va = col.sortValue!(a);
    const vb = col.sortValue!(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fa");
    return cmp * dir;
  });
  const pages = Math.max(1, Math.ceil(out.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = out.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(key);
      setDir(-1);
    }
    setPage(0);
  }

  return (
    <div className="space-y-3">
      {searchKeys && (
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="جستجو..." className="max-w-xs" />
      )}
      <div className="overflow-x-auto rounded-xl border border-tg-border">
        <table className="w-full text-sm">
          <thead className="bg-tg-hover/40 text-xs text-tg-secondary">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 text-start">
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-tg-text">
                      {c.label} {sortKey === c.key ? (dir === -1 ? "↓" : "↑") : ""}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tg-border">
            {slice.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-tg-text">{c.render(r)}</td>
                ))}
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-tg-secondary">
                  موردی نیست.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-tg-secondary">
          <span>
            صفحه {safePage + 1} از {pages} · {out.length} مورد
          </span>
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              قبلی
            </Button>
            <Button variant="secondary" size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-tg-secondary">{label}</span>
      {children}
    </label>
  );
}

export function BoardSelect({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; ariaLabel: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[40px]" aria-label={ariaLabel}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
