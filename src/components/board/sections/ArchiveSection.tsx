"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { useBoardDataset } from "@/lib/board/store";
import { DataTable } from "@/components/board/ui";
import { SourceBadge, fmt } from "@/components/board/badges";

export default function BoardArchivePage() {
  const { dataset } = useBoardDataset();
  const [channel, setChannel] = useState("");
  const [program, setProgram] = useState("");

  const rows = useMemo(() => {
    let out = dataset.rows;
    if (channel) out = out.filter((r) => r.channel === channel);
    if (program) out = out.filter((r) => r.program === program);
    return out;
  }, [dataset.rows, channel, program]);
  const channels = useMemo(() => [...new Set(dataset.rows.map((r) => r.channel))], [dataset.rows]);
  const programs = useMemo(() => [...new Set(dataset.rows.map((r) => r.program))], [dataset.rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">آرشیو محتوا</h2>
        <SourceBadge source={dataset.source} />
      </div>
      <p className="max-w-3xl text-sm leading-6 text-tg-secondary">
        فهرست قابل جست‌وجوی همه ویدیوها بر اساس کانال، برنامه و نوع محتوا. آرشیو عملیاتی فایل‌ها (نسخه‌های تدوین، مجوزها، زیرنویس) در اتاق محتوا نگهداری می‌شود.
      </p>
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="min-h-[40px] rounded-lg border border-tg-border bg-tg-surface px-2 text-xs text-tg-text" aria-label="کانال">
            <option value="">همه کانال‌ها</option>
            {channels.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={program} onChange={(e) => setProgram(e.target.value)} className="min-h-[40px] rounded-lg border border-tg-border bg-tg-surface px-2 text-xs text-tg-text" aria-label="برنامه">
            <option value="">همه برنامه‌ها</option>
            {programs.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <DataTable
          rows={rows.map((r, i) => ({ ...r, id: `${r.channel}-${r.videoTitle}-${i}` }))}
          columns={[
            { key: "title", label: "عنوان", render: (r) => <span title={r.videoTitle}>{r.videoTitle.length > 45 ? `${r.videoTitle.slice(0, 45)}…` : r.videoTitle}</span>, sortValue: (r) => r.videoTitle },
            { key: "channel", label: "کانال", render: (r) => r.channel },
            { key: "program", label: "برنامه", render: (r) => r.program },
            { key: "type", label: "نوع", render: (r) => r.contentType },
            { key: "date", label: "تاریخ", render: (r) => <span className="tabular-nums" dir="ltr">{r.date}</span>, sortValue: (r) => r.date },
            { key: "views", label: "بازدید", render: (r) => <span className="tabular-nums">{fmt(r.views)}</span>, sortValue: (r) => r.views },
          ]}
          searchKeys={[(r) => `${r.videoTitle} ${r.program} ${r.channel}`]}
          pageSize={15}
        />
      </Card>
    </div>
  );
}
