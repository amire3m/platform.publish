"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui";
import type {
  StrategyChartCompare,
  StrategyChartDemand,
  StrategyChartTrend,
} from "@/lib/strategy/types";

// نمودارهای تعاملی (recharts ~۳۸۶KB) فقط وقتی کاربر اسکرول کرد به بخش نمودار لود می‌شوند.
// اگر لود نشدند (اینترنت ضعیف)، جدول استاتیک همان داده نمایش داده می‌شود.

export interface ChartsData {
  demand?: StrategyChartDemand[];
  demandSource?: string;
  trend?: StrategyChartTrend;
  compare?: StrategyChartCompare[];
  compareSource?: string;
}

const StrategyChartsHeavy = dynamic(
  () =>
    import("./Charts").then((m) => ({
      default: (p: { charts: ChartsData }) => (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {p.charts.demand && <m.DemandChart data={p.charts.demand} source={p.charts.demandSource} />}
            {p.charts.compare && <m.CompareChart data={p.charts.compare} source={p.charts.compareSource} />}
          </div>
          {p.charts.trend && <m.TrendChart trend={p.charts.trend} />}
        </>
      ),
    })),
  { ssr: false, loading: () => <ChartsSkeleton /> }
);

function ChartsSkeleton(): ReactNode {
  return (
    <div className="grid gap-3">
      {[1, 2].map((i) => (
        <Card key={i} className="p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-44 animate-pulse rounded bg-white/5" />
          <p className="mt-2 text-xs text-muted">در حال بارگذاری نمودار تعاملی…</p>
        </Card>
      ))}
    </div>
  );
}

class ChartsErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function StaticFallback({ charts }: { charts: ChartsData }): ReactNode {
  const fmt = (v: number | null): string => (v == null ? "—" : `${v} هزار بازدید`);
  return (
    <div className="grid gap-3">
      {charts.demand && (
        <Card className="p-4">
          <h4 className="text-sm font-bold">تقاضا در یک نگاه (میانه ۵ ویدیوی برتر)</h4>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {charts.demand.map((r) => (
                <tr key={r.label} className="border-t border-white/10">
                  <td className="py-1.5 pl-2">{r.label}</td>
                  <td className="py-1.5 text-left text-muted">{fmt(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">
            نمودار تعاملی لود نشد (اینترنت ضعیف) — همین داده بالا خلاصه آن است. منبع: {charts.demandSource}
          </p>
        </Card>
      )}
      {charts.compare && (
        <Card className="p-4">
          <h4 className="text-sm font-bold">۱۲ ماه اخیر در برابر مرجع همه‌زمان</h4>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {charts.compare.map((r) => (
                <tr key={r.label} className="border-t border-white/10">
                  <td className="py-1.5 pl-2">{r.label}</td>
                  <td className="py-1.5 text-left text-muted">
                    اخیر: {fmt(r.recent)} / همه‌زمان: {fmt(r.allTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {charts.trend && (
        <Card className="p-4">
          <h4 className="text-sm font-bold">روند علاقه ماهانه ({charts.trend.lines.map((l) => l.name).join("، ")})</h4>
          <p className="mt-1 text-xs text-muted">
            بازه {charts.trend.months.length} ماهه — نمودار تعاملی لود نشد. منبع: {charts.trend.source}
          </p>
        </Card>
      )}
    </div>
  );
}

export function ChartsLazySection({ charts }: { charts: ChartsData }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {visible ? (
        <ChartsErrorBoundary fallback={<StaticFallback charts={charts} />}>
          <StrategyChartsHeavy charts={charts} />
        </ChartsErrorBoundary>
      ) : (
        <Card className="p-4">
          <div className="h-44 animate-pulse rounded bg-white/5" />
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            <BarChart3 size={14} /> نمودارها با اسکرول به اینجا بارگذاری می‌شوند…
          </p>
        </Card>
      )}
    </div>
  );
}
