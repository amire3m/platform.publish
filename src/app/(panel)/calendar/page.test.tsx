import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";

const mocks = vi.hoisted(() => ({
  timedFetch: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/lib/fetch-timeout", () => ({ timedFetch: mocks.timedFetch }));
vi.mock("@/components/providers", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/lib/date/jalali", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/date/jalali")>();
  return { ...actual, todayJalali: () => ({ jy: 1405, jm: 8, jd: 2, hour: 0, minute: 0 }) };
});

import CalendarPage from "./page";

const planEvent = {
  displayId: "plan-1405-08-02-01",
  source: "plan",
  contentId: null,
  publicationId: null,
  title: "برنامه نمایشی تقویم",
  platform: "youtube",
  accountId: "ACC-1405-398046",
  channel: "zaviye_no",
  channelLabel: "زاویه نو",
  contentType: "plan",
  status: "planned",
  publishAtUtc: "2026-10-24T07:30:00Z",
  publishAtJalali: "1405/08/02 11:00",
  contentStatus: "planned",
  hasError: false,
};

const realEvent = {
  contentId: "CNT-1",
  publicationId: null,
  title: "محتوای واقعی تقویم",
  platform: "youtube",
  accountId: "ACC-1405-398046",
  channel: "zaviye_no",
  channelLabel: "زاویه نو",
  contentType: "full_video",
  status: "scheduled",
  publishAtUtc: "2026-10-24T08:30:00Z",
  publishAtJalali: "1405/08/02 12:00",
  contentStatus: "approved",
  hasError: false,
};

describe("CalendarPage display-only events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.timedFetch.mockResolvedValue(Response.json({ ok: true, data: [planEvent, realEvent] }));
  });

  afterEach(() => cleanup());

  it("keeps plan events non-draggable and non-linked without changing real events", async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CalendarPage />
      </SWRConfig>,
    );

    const monthPlan = await screen.findByText(planEvent.title);
    const monthReal = screen.getByText(realEvent.title);
    expect(monthPlan.closest("[draggable]")).toHaveAttribute("draggable", "false");
    expect(monthReal.closest("[draggable]")).toHaveAttribute("draggable", "true");

    fireEvent.click(screen.getByRole("button", { name: "لیست" }));

    const listPlan = screen.getByText(planEvent.title);
    const listReal = screen.getByText(realEvent.title);
    expect(listPlan.closest("a")).toBeNull();
    expect(listReal.closest("a")).toHaveAttribute("href", "/content/CNT-1");
    expect(screen.getByText("برنامه انتشار")).toBeInTheDocument();
  });
});
