import type { ChannelId } from "@/lib/channels";

export interface CalendarPlanEntry {
  id: string;
  title: string;
  channel: Extract<ChannelId, "zaviye_no" | "zed_revayat" | "tamashin">;
  publishAtUtc: string;
  publishAtJalali: string;
}

export const CALENDAR_PLAN_ENTRIES: readonly CalendarPlanEntry[] = [
  { id: "plan-1405-08-02-01", title: "برنامه بلندگو", channel: "zaviye_no", publishAtUtc: "2026-10-24T07:30:00Z", publishAtJalali: "1405/08/02 11:00" },
  { id: "plan-1405-08-02-02", title: "برنامه بلندگو", channel: "zed_revayat", publishAtUtc: "2026-10-24T07:30:00Z", publishAtJalali: "1405/08/02 11:00" },
  { id: "plan-1405-08-02-03", title: "مستندهای ضد روایت", channel: "zed_revayat", publishAtUtc: "2026-10-24T09:30:00Z", publishAtJalali: "1405/08/02 13:00" },
  { id: "plan-1405-08-03-01", title: "برنامه زاویه صفر درجه", channel: "zaviye_no", publishAtUtc: "2026-10-25T13:30:00Z", publishAtJalali: "1405/08/03 17:00" },
  { id: "plan-1405-08-03-02", title: "سریال مشاور", channel: "tamashin", publishAtUtc: "2026-10-25T15:30:00Z", publishAtJalali: "1405/08/03 19:00" },
  { id: "plan-1405-08-04-01", title: "برش‌های سریال مشاور", channel: "tamashin", publishAtUtc: "2026-10-26T05:30:00Z", publishAtJalali: "1405/08/04 09:00" },
  { id: "plan-1405-08-04-02", title: "مستندهای ضد روایت", channel: "zed_revayat", publishAtUtc: "2026-10-26T09:30:00Z", publishAtJalali: "1405/08/04 13:00" },
  { id: "plan-1405-08-05-01", title: "ریلزهای مشاور", channel: "tamashin", publishAtUtc: "2026-10-27T05:30:00Z", publishAtJalali: "1405/08/05 09:00" },
  { id: "plan-1405-08-05-02", title: "برش‌های زاویه صفر درجه", channel: "zaviye_no", publishAtUtc: "2026-10-27T08:30:00Z", publishAtJalali: "1405/08/05 12:00" },
  { id: "plan-1405-08-06-01", title: "برنامه بلندگو", channel: "zaviye_no", publishAtUtc: "2026-10-28T07:30:00Z", publishAtJalali: "1405/08/06 11:00" },
  { id: "plan-1405-08-06-02", title: "برنامه بلندگو", channel: "zed_revayat", publishAtUtc: "2026-10-28T07:30:00Z", publishAtJalali: "1405/08/06 11:00" },
  { id: "plan-1405-08-06-03", title: "مستندهای ضد روایت", channel: "zed_revayat", publishAtUtc: "2026-10-28T09:30:00Z", publishAtJalali: "1405/08/06 13:00" },
  { id: "plan-1405-08-07-01", title: "ریلز زاویه صفر درجه", channel: "zaviye_no", publishAtUtc: "2026-10-29T07:00:00Z", publishAtJalali: "1405/08/07 10:30" },
  { id: "plan-1405-08-07-02", title: "سریال مشاور", channel: "tamashin", publishAtUtc: "2026-10-29T15:30:00Z", publishAtJalali: "1405/08/07 19:00" },
  { id: "plan-1405-08-08-01", title: "برش و ریلز مشاور", channel: "tamashin", publishAtUtc: "2026-10-30T06:30:00Z", publishAtJalali: "1405/08/08 10:00" },
];
