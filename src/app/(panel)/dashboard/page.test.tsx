import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const mockReplace = vi.fn();
let mockSearchParamsValue = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue ? `accountId=${mockSearchParamsValue}` : ""),
}));

function mockFetchForAccountsAndSummary() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes("/api/accounts")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: [
            { id: "acc1", platform: "youtube", username: "ch1", displayName: "کانال یک", organization: "emro", profileImage: null, active: true, connectionStatus: "connected", topicId: null, topicLabel: null, lastSyncAt: null, capabilities: {}, externalAccountId: "UC1" },
            { id: "acc2", platform: "youtube", username: "ch2", displayName: "کانال دو", organization: "emro", profileImage: null, active: true, connectionStatus: "connected", topicId: null, topicLabel: null, lastSyncAt: null, capabilities: {}, externalAccountId: "UC2" },
            { id: "acc3", platform: "youtube", username: "ch3", displayName: "کانال سه", organization: "emro", profileImage: null, active: true, connectionStatus: "connected", topicId: null, topicLabel: null, lastSyncAt: null, capabilities: {}, externalAccountId: "UC3" },
            { id: "acc4", platform: "youtube", username: "ch4", displayName: "کانال چهار", organization: "emro", profileImage: null, active: true, connectionStatus: "connected", topicId: null, topicLabel: null, lastSyncAt: null, capabilities: {}, externalAccountId: "UC4" },
          ],
        }),
      } as unknown as Response;
    }
    if (url.includes("/api/dashboard/summary")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            kpis: { contentProductsTotal: 1, contentProductsOverdue: 0, programsTotal: 0, deliverablesTotal: 0, publicationsTotal: 0, publicationsFailed: 0, progress: null },
            byStatus: {},
            byChannel: {},
            byProductType: {},
            attention: { overdueProducts: [], overdueCount: 0, failedPublications: [], failedCount: 0 },
            teamWorkload: [],
            mailUnread: { info: 0, support: 0, total: 0 },
            youtube: { totalViews30d: 0, byChannel: [], topVideos: [] },
            instagram: { status: "awaiting_connection", byPage: [], connectedCount: 0 },
          },
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true, data: {} }) } as unknown as Response;
  });
}

import DashboardPage from "./page";

describe("Dashboard per-channel selector + header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsValue = "";
    global.fetch = mockFetchForAccountsAndSummary() as unknown as typeof fetch;
  });
  afterEach(() => {
    cleanup();
  });

  it("shows per-channel selector with همه حساب‌های Emro YT and aggregated header by default", async () => {
    render(<DashboardPage />);
    // wait for async SWR to resolve
    await waitFor(() => expect(screen.getByText("همه حساب‌های Emro YT")).toBeInTheDocument());
    // also check that aggregated header text appears (ChannelHeader aggregated shows "همه کانال‌ها")
    expect(screen.getByText(/همه کانال‌ها/)).toBeInTheDocument();
    // selector should be a select element with aria-label or containing options
    const select = screen.getByLabelText("حساب یوتیوب") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("");
    // options include 4 channels
    expect(screen.getByText("کانال یک")).toBeInTheDocument();
    expect(screen.getByText("کانال دو")).toBeInTheDocument();
  });

  it("shows per-channel header when account selected", async () => {
    mockSearchParamsValue = "acc2";
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText("همه حساب‌های Emro YT")).toBeInTheDocument());
    // when single selected, header should show channel name instead of aggregated text
    await waitFor(() => expect(screen.getAllByText("کانال دو").length).toBeGreaterThanOrEqual(1));
    const select = screen.getByLabelText("حساب یوتیوب") as HTMLSelectElement;
    expect(select.value).toBe("acc2");
    // header should display @ch2
    expect(screen.getByText(/@ch2/)).toBeInTheDocument();
    // aggregated text should not be present when single selected
    expect(screen.queryByText(/همه کانال‌ها/)).not.toBeInTheDocument();
  });
});
