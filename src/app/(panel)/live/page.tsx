"use client";
import { useState } from "react";
import { Radio, MonitorPlay, CalendarClock, Tv, History, Palette } from "lucide-react";
import LiveTab from "./LiveTab";
import ChannelsTab from "./ChannelsTab";
import SchedulesTab from "./SchedulesTab";
import HistoryTab from "./HistoryTab";
import ScenesTab from "./ScenesTab";

type TabKey = "live" | "schedules" | "channels" | "scenes" | "history";

const TABS: { key: TabKey; label: string; icon: typeof Radio }[] = [
  { key: "live", label: "پخش زنده", icon: MonitorPlay },
  { key: "schedules", label: "برنامه‌ها", icon: CalendarClock },
  { key: "channels", label: "کانال‌ها", icon: Tv },
  { key: "scenes", label: "صحنه‌ها", icon: Palette },
  { key: "history", label: "تاریخچه", icon: History },
];

export default function LivePage() {
  const [tab, setTab] = useState<TabKey>("live");

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-tg-text">
          <Radio className="h-5 w-5 text-rose-500" />
          کنداکتور لایو
        </h1>
        <p className="text-sm text-tg-secondary">پخش زنده پلی‌لیست یوتیوب یا منبع m3u8 به RTMP — با صحنه‌های گرافیکی، PiP و برنامه‌های روزانه.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-tg-border pb-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              tab === key ? "bg-tg-accent/15 font-semibold text-tg-accent" : "text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "live" && <LiveTab />}
      {tab === "schedules" && <SchedulesTab />}
      {tab === "channels" && <ChannelsTab />}
      {tab === "scenes" && <ScenesTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
