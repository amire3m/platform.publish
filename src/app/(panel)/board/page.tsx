import OverviewSection from "@/components/board/sections/OverviewSection";
import ChannelsSection from "@/components/board/sections/ChannelsSection";
import DashboardSection from "@/components/board/sections/DashboardSection";
import ZaviyeNoSection from "@/components/board/sections/ZaviyeNoSection";
import ProductionSection from "@/components/board/sections/ProductionSection";
import ArchiveSection from "@/components/board/sections/ArchiveSection";
import CalendarSection from "@/components/board/sections/CalendarSection";
import FutureSection from "@/components/board/sections/FutureSection";
import CollabsSection from "@/components/board/sections/CollabsSection";
import LicensesSection from "@/components/board/sections/LicensesSection";
import InstagramSection from "@/components/board/sections/InstagramSection";
import TelegramSection from "@/components/board/sections/TelegramSection";
import MeetingSection from "@/components/board/sections/MeetingSection";
import SettingsSection from "@/components/board/sections/SettingsSection";

const SECTIONS: Array<{ id: string; node: React.ReactNode }> = [
  { id: "overview", node: <OverviewSection /> },
  { id: "channels", node: <ChannelsSection /> },
  { id: "dashboard", node: <DashboardSection /> },
  { id: "zaviyeno", node: <ZaviyeNoSection /> },
  { id: "production", node: <ProductionSection /> },
  { id: "archive", node: <ArchiveSection /> },
  { id: "calendar", node: <CalendarSection /> },
  { id: "future", node: <FutureSection /> },
  { id: "collabs", node: <CollabsSection /> },
  { id: "licenses", node: <LicensesSection /> },
  { id: "instagram", node: <InstagramSection /> },
  { id: "telegram", node: <TelegramSection /> },
  { id: "meeting", node: <MeetingSection /> },
  { id: "settings", node: <SettingsSection /> },
];

export default function BoardSinglePage() {
  return (
    <div className="space-y-10">
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} aria-label={s.id} className="scroll-mt-28">
          {s.node}
        </section>
      ))}
    </div>
  );
}
