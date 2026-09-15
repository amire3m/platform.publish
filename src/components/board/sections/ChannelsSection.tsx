"use client";

import { BOARD_CHANNELS } from "@/lib/board/channels";
import { useBoardDataset } from "@/lib/board/store";
import { filterRows, liveMetaFor, totals } from "@/lib/board/stats";
import { ChannelCard } from "@/components/board/ChannelCard";

export default function BoardChannelsPage() {
  const { dataset } = useBoardDataset();
  const live = dataset.source === "live";
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-tg-text">معرفی چهار کانال یوتیوبی</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {BOARD_CHANNELS.map((ch) => {
          const rows = filterRows(dataset.rows, { channels: [ch.nameFa] });
          const t = totals(rows);
          const meta = liveMetaFor(dataset, ch.id);
          return (
            <ChannelCard
              key={ch.id}
              channel={ch}
              imageUrl={ch.imageUrl ?? null}
              source={dataset.source}
              stats={{
                views: meta?.views ?? t.views,
                subs: meta?.subs ?? t.subsGained - t.subsLost,
                videos: meta?.videos ?? t.videos,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
