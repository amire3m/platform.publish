"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, EmptyState, Skeleton } from "@/components/ui";

interface AudienceDatum {
  ageGroup: string;
  gender: string;
  views: number;
}

interface DeviceDatum {
  deviceType: string;
  views: number;
}

interface AudienceChartProps {
  data?: readonly AudienceDatum[] | null;
  deviceData?: readonly DeviceDatum[] | null;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_MESSAGE = "هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید";

const PLACEHOLDER_AUDIENCE: AudienceDatum[] = [
  { ageGroup: "18-24", gender: "male", views: 3200 },
  { ageGroup: "18-24", gender: "female", views: 1800 },
  { ageGroup: "25-34", gender: "male", views: 4100 },
  { ageGroup: "25-34", gender: "female", views: 2600 },
  { ageGroup: "35-44", gender: "male", views: 1900 },
];

const PLACEHOLDER_DEVICE: DeviceDatum[] = [
  { deviceType: "MOBILE", views: 6200 },
  { deviceType: "DESKTOP", views: 2100 },
  { deviceType: "TV", views: 800 },
];

const DEVICE_COLORS = ["var(--tg-accent)", "#38bdf8", "#f59e0b", "#a78bfa"];

export function AudienceChart({ data, deviceData, isLoading, error }: AudienceChartProps) {
  if (isLoading) return <Skeleton className="h-72" />;
  if (error) return <Card><p className="text-sm text-rose-600 dark:text-rose-400">{error}</p></Card>;
  const hasData = data && data.length > 0;
  const hasDevice = deviceData && deviceData.length > 0;
  const audienceRows = hasData ? data : PLACEHOLDER_AUDIENCE;
  const deviceRows = hasDevice ? deviceData : PLACEHOLDER_DEVICE;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4">
        <div>
          <h3 className="font-bold text-tg-text">مخاطب — سن و جنسیت</h3>
          <p className="mt-1 text-xs text-tg-secondary">میله‌های انباشته بر اساس گروه سنی × جنسیت</p>
        </div>
        {!hasData && (
          <div className="rounded-lg border border-dashed border-tg-border bg-tg-hover/50 px-4 py-3 text-center text-xs leading-5 text-tg-secondary">
            {EMPTY_MESSAGE}
          </div>
        )}
        <div className="h-64 min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={audienceRows as unknown as Record<string, unknown>[]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
              <XAxis dataKey="ageGroup" stroke="var(--tg-secondary)" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis stroke="var(--tg-secondary)" tickLine={false} axisLine={false} width={48} fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, direction: "rtl" }} />
              <Bar dataKey="views" fill="var(--tg-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} opacity={hasData ? 1 : 0.55} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!hasData && <EmptyState title="نمونه مخاطب" description="پس از sync، ترکیب سنی/جنسیتی واقعی نمایش داده می‌شود." />}
      </Card>

      <Card className="space-y-4">
        <div>
          <h3 className="font-bold text-tg-text">نوع دستگاه</h3>
          <p className="mt-1 text-xs text-tg-secondary">سهم بازدید بر اساس دستگاه (پای)</p>
        </div>
        {!hasDevice && (
          <div className="rounded-lg border border-dashed border-tg-border bg-tg-hover/50 px-4 py-3 text-center text-xs leading-5 text-tg-secondary">
            {EMPTY_MESSAGE}
          </div>
        )}
        <div className="h-64 min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={deviceRows as unknown as Record<string, unknown>[]} dataKey="views" nameKey="deviceType" cx="50%" cy="50%" outerRadius={88} isAnimationActive={false} opacity={hasDevice ? 1 : 0.65}>
                {(deviceRows as DeviceDatum[]).map((_, i) => (
                  <Cell key={i} fill={DEVICE_COLORS[i % DEVICE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
