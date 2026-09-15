import type { CsvRow } from "./types";

export interface RangeFilter {
  from: string;
  to: string;
}

export function filterRows(rows: CsvRow[], opts: { channels?: string[]; range?: RangeFilter | null; program?: string; query?: string }): CsvRow[] {
  return rows.filter((r) => {
    if (opts.channels?.length && !opts.channels.includes(r.channel)) return false;
    if (opts.range?.from && r.date < opts.range.from) return false;
    if (opts.range?.to && r.date > opts.range.to) return false;
    if (opts.program && r.program !== opts.program) return false;
    if (opts.query && !`${r.videoTitle} ${r.program}`.includes(opts.query)) return false;
    return true;
  });
}

export function sum(rows: CsvRow[], f: (r: CsvRow) => number): number {
  return rows.reduce((s, r) => s + f(r), 0);
}

export interface Totals {
  views: number;
  watchMinutes: number;
  likes: number;
  comments: number;
  shares: number;
  subsGained: number;
  subsLost: number;
  videos: number;
  avgViews: number;
  avgDuration: number | null;
  engagement: number | null;
  ctr: number | null;
}

export function totals(rows: CsvRow[]): Totals {
  const views = sum(rows, (r) => r.views);
  const avgDurRows = rows.filter((r) => r.avgViewSeconds != null);
  const ctrRows = rows.filter((r) => r.ctr != null);
  return {
    views,
    watchMinutes: sum(rows, (r) => r.watchMinutes),
    likes: sum(rows, (r) => r.likes),
    comments: sum(rows, (r) => r.comments),
    shares: sum(rows, (r) => r.shares),
    subsGained: sum(rows, (r) => r.subsGained),
    subsLost: sum(rows, (r) => r.subsLost),
    videos: rows.length,
    avgViews: rows.length ? Math.round(views / rows.length) : 0,
    avgDuration: avgDurRows.length ? Math.round(avgDurRows.reduce((s, r) => s + (r.avgViewSeconds ?? 0), 0) / avgDurRows.length) : null,
    engagement: views ? +(((sum(rows, (r) => r.likes + r.comments + r.shares)) / views) * 100).toFixed(1) : null,
    ctr: ctrRows.length ? +(ctrRows.reduce((s, r) => s + (r.ctr ?? 0), 0) / ctrRows.length).toFixed(1) : null,
  };
}

export interface TimePoint {
  date: string;
  views: number;
  subs: number;
  videos: number;
}

export function viewsOverTime(rows: CsvRow[]): TimePoint[] {
  const map = new Map<string, TimePoint>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const cur = map.get(r.date) ?? { date: r.date, views: 0, subs: 0, videos: 0 };
    cur.views += r.views;
    cur.subs += r.subsGained - r.subsLost;
    cur.videos += 1;
    map.set(r.date, cur);
  }
  return [...map.values()];
}

export interface ShareSlice {
  name: string;
  views: number;
  subs: number;
}

export function programShare(rows: CsvRow[]): ShareSlice[] {
  const map = new Map<string, ShareSlice>();
  for (const r of rows) {
    const cur = map.get(r.program) ?? { name: r.program, views: 0, subs: 0 };
    cur.views += r.views;
    cur.subs += r.subsGained;
    map.set(r.program, cur);
  }
  return [...map.values()].sort((a, b) => b.views - a.views);
}

export interface TopVideo {
  title: string;
  program: string;
  channel: string;
  views: number;
  subs: number;
  engagement: number | null;
}

export function topVideos(rows: CsvRow[], n = 10): TopVideo[] {
  return [...rows]
    .sort((a, b) => b.views - a.views)
    .slice(0, n)
    .map((r) => ({
      title: r.videoTitle,
      program: r.program,
      channel: r.channel,
      views: r.views,
      subs: r.subsGained,
      engagement: r.views ? +(((r.likes + r.comments + r.shares) / r.views) * 100).toFixed(1) : null,
    }));
}

/** YouTube Partner thresholds: 1000 subs + 4000 watch hours (12mo). Progress from dataset (best-effort). */
export function monetizationProgress(rows: CsvRow[]): { subs: number; watchHours: number; subsPct: number; hoursPct: number } {
  const subs = sum(rows, (r) => r.subsGained - r.subsLost);
  const watchHours = sum(rows, (r) => r.watchMinutes) / 60;
  return {
    subs,
    watchHours: Math.round(watchHours),
    subsPct: Math.min(100, Math.round((subs / 1000) * 100)),
    hoursPct: Math.min(100, Math.round((watchHours / 4000) * 100)),
  };
}

export function lowHighPerformers(rows: CsvRow[]): { low: TopVideo[]; high: TopVideo[] } {
  const sorted = topVideos(rows, rows.length);
  const mid = Math.max(1, Math.floor(sorted.length / 3));
  return { high: sorted.slice(0, mid), low: sorted.slice(-mid).reverse() };
}
