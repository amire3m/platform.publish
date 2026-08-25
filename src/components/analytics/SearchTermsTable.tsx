"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { formatAnalyticsNumber, formatWatchMinutes } from "@/lib/analytics/presentation";

interface SearchRow {
  keyword: string;
  views: number;
  watchTimeMinutes: number;
}

interface SearchTermsTableProps {
  data?: readonly SearchRow[] | null;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_MESSAGE = "هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید";

const PLACEHOLDER: SearchRow[] = [
  { keyword: "امام روح‌الله", views: 1200, watchTimeMinutes: 5400 },
  { keyword: "سخنرانی", views: 950, watchTimeMinutes: 3200 },
  { keyword: "مستند کوتاه", views: 700, watchTimeMinutes: 2100 },
  { keyword: "ویژه برنامه", views: 520, watchTimeMinutes: 1800 },
];

type SortKey = "views" | "watchTimeMinutes" | "keyword";
type Dir = "asc" | "desc";

export function SearchTermsTable({ data, isLoading, error }: SearchTermsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [dir, setDir] = useState<Dir>("desc");
  if (isLoading) return <Skeleton className="h-72" />;
  if (error) return <Card><p className="text-sm text-rose-600 dark:text-rose-400">{error}</p></Card>;
  const hasData = data && data.length > 0;
  const rows = (hasData ? [...data] : [...PLACEHOLDER]) as SearchRow[];
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "keyword") cmp = a.keyword.localeCompare(b.keyword, "fa");
    else cmp = (a[sortKey] as number) - (b[sortKey] as number);
    return dir === "asc" ? cmp : -cmp;
  });

  function toggle(k: SortKey) {
    if (k === sortKey) setDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return <Icon className="h-3 w-3" aria-hidden="true" />;
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-tg-border px-4 py-4 sm:px-5">
        <h3 className="font-bold text-tg-text">عبارات جستجو</h3>
        <p className="mt-1 text-xs text-tg-secondary">insightTrafficSourceDetail where type=YT_SEARCH — قابل مرتب‌سازی</p>
      </div>
      {!hasData && (
        <div className="mx-4 mt-4 rounded-lg border border-dashed border-tg-border bg-tg-hover/50 px-4 py-3 text-center text-xs leading-5 text-tg-secondary">
          {EMPTY_MESSAGE}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-tg-hover/40 text-xs text-tg-secondary">
            <tr>
              <th className="px-4 py-2 text-start">
                <button type="button" onClick={() => toggle("keyword")} className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-tg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent">
                  کلیدواژه <SortIcon k="keyword" />
                </button>
              </th>
              <th className="px-4 py-2 text-start">
                <button type="button" onClick={() => toggle("views")} className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-tg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent">
                  بازدید <SortIcon k="views" />
                </button>
              </th>
              <th className="px-4 py-2 text-start">
                <button type="button" onClick={() => toggle("watchTimeMinutes")} className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-tg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent">
                  زمان تماشا <SortIcon k="watchTimeMinutes" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tg-border">
            {sorted.map((row) => (
              <tr key={row.keyword} className={hasData ? "" : "opacity-60"}>
                <td className="px-4 py-3 font-medium text-tg-text">{row.keyword}</td>
                <td className="px-4 py-3 text-tg-text">{formatAnalyticsNumber(row.views)}</td>
                <td className="px-4 py-3 text-tg-text">{formatWatchMinutes(row.watchTimeMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hasData && <div className="px-5 pb-4"><EmptyState title="نمونه جستجو" description="پس از sync، کلمات کلیدی واقعی نمایش داده می‌شوند." /></div>}
    </Card>
  );
}
