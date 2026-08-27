import { describe, it, expect, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleDashboardSummaryRequest, type DashboardSummaryDependencies } from "./route";

function makeDeps(overrides: Partial<DashboardSummaryDependencies> = {}): DashboardSummaryDependencies {
  return {
    requireDashboardAccess: vi.fn().mockResolvedValue({ user: { id: "u1", role: "manager" }, response: null }),
    fetchContentProducts: vi.fn().mockResolvedValue([]),
    fetchPrograms: vi.fn().mockResolvedValue([]),
    fetchDeliverables: vi.fn().mockResolvedValue([]),
    fetchPublications: vi.fn().mockResolvedValue([]),
    fetchUsers: vi.fn().mockResolvedValue([]),
    fetchMailUnread: vi.fn().mockResolvedValue(0),
    fetchYoutubeSummary: vi.fn().mockResolvedValue({ totalViews30d: 0, byChannel: [], topVideos: [] }),
    fetchInstagramSummary: vi.fn().mockResolvedValue({ status: "awaiting_connection", byPage: [], connectedCount: 0 }),
    now: () => new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  } as unknown as DashboardSummaryDependencies;
}

describe("GET /api/dashboard/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const deps = makeDeps({
      requireDashboardAccess: vi.fn().mockResolvedValue({
        user: null,
        response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED"),
      }) as never,
      fetchContentProducts: vi.fn(),
      fetchPrograms: vi.fn(),
      fetchDeliverables: vi.fn(),
      fetchPublications: vi.fn(),
    });
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(res.status).toBe(401);
    expect(deps.fetchContentProducts).not.toHaveBeenCalled();
  });

  it("returns 403 when forbidden (missing view_dashboard and combined perms)", async () => {
    const deps = makeDeps({
      requireDashboardAccess: vi.fn().mockResolvedValue({
        user: null,
        response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN"),
      }) as never,
      fetchContentProducts: vi.fn(),
    });
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(res.status).toBe(403);
    expect(deps.fetchContentProducts).not.toHaveBeenCalled();
  });

  it("aggregates content_products by status, product_type, channel and overdue", async () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    const products = [
      { id: "CPR-1", title: "سریال 1", productType: "serial", channel: "zed_revayat", status: "imported", dueAt: new Date("2026-08-10T00:00:00Z"), createdBy: "u1" },
      { id: "CPR-2", title: "سریال 2", productType: "documentary", channel: "zaviye_no", status: "cover_ready", dueAt: new Date("2026-08-25T00:00:00Z"), createdBy: "u1" },
      { id: "CPR-3", title: "سریال 3", productType: "serial", channel: "zed_revayat", status: "ready_to_send", dueAt: new Date("2026-08-10T00:00:00Z"), createdBy: "u2" }, // overdue but ready_to_send should NOT count
      { id: "CPR-4", title: "سریال 4", productType: "film", channel: "shock", status: "editing_youtube", dueAt: null, createdBy: "u2" },
    ];
    const deps = makeDeps({
      fetchContentProducts: vi.fn().mockResolvedValue(products as never),
      fetchPrograms: vi.fn().mockResolvedValue([{ id: "WPR-1" }] as never),
      fetchDeliverables: vi.fn().mockResolvedValue([
        { id: "WDL-1", programId: "WPR-1", productionStatus: "ready", assigneeUserId: "u1", createdAt: now, updatedAt: now, archivedAt: null },
        { id: "WDL-2", programId: "WPR-1", productionStatus: "in_progress", assigneeUserId: "u2", createdAt: now, updatedAt: now, archivedAt: null },
      ] as never),
      fetchPublications: vi.fn().mockResolvedValue([
        { id: "WPU-1", deliverableId: "WDL-1", platform: "youtube", status: "published", createdAt: now, updatedAt: now, scheduledAt: null },
        { id: "WPU-2", deliverableId: "WDL-1", platform: "telegram", status: "failed", createdAt: now, updatedAt: now, scheduledAt: null },
        { id: "WPU-3", deliverableId: "WDL-2", platform: "instagram", status: "ready", createdAt: now, updatedAt: now, scheduledAt: null },
      ] as never),
      fetchUsers: vi.fn().mockResolvedValue([
        { id: "u1", name: "Alice" },
        { id: "u2", name: "Bob" },
      ] as never),
      fetchMailUnread: vi.fn().mockResolvedValue(0),
      now: () => now,
    });

    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.data;

    // top-level keys required by spec
    expect(data).toHaveProperty("kpis");
    expect(data).toHaveProperty("byStatus");
    expect(data).toHaveProperty("byChannel");
    expect(data).toHaveProperty("byProductType");
    expect(data).toHaveProperty("attention");
    expect(data).toHaveProperty("teamWorkload");
    expect(data).toHaveProperty("mailUnread");

    // byStatus counts (7 statuses)
    expect(data.byStatus.imported).toBe(1);
    expect(data.byStatus.cover_ready).toBe(1);
    expect(data.byStatus.ready_to_send).toBe(1);
    expect(data.byStatus.editing_youtube).toBe(1);

    // byProductType
    expect(data.byProductType.serial).toBe(2);
    expect(data.byProductType.documentary).toBe(1);
    expect(data.byProductType.film).toBe(1);

    // byChannel
    expect(data.byChannel.zed_revayat).toBe(2);
    expect(data.byChannel.zaviye_no).toBe(1);
    expect(data.byChannel.shock).toBe(1);

    // overdue: only CPR-1 (CPR-3 is ready_to_send, excluded)
    expect(data.kpis.contentProductsOverdue).toBe(1);
    expect(data.attention.overdueCount).toBe(1);
    expect(data.attention.overdueProducts).toHaveLength(1);
    expect(data.attention.overdueProducts[0].id).toBe("CPR-1");

    // workflow counts
    expect(data.kpis.programsTotal).toBe(1);
    expect(data.kpis.deliverablesTotal).toBe(2);
    expect(data.kpis.publicationsTotal).toBe(3);
    expect(data.kpis.publicationsFailed).toBe(1);
    expect(data.workflow.deliverablesByStatus.ready).toBe(1);
    expect(data.workflow.deliverablesByStatus.in_progress).toBe(1);
    expect(data.workflow.publicationsByStatus.failed).toBe(1);
    expect(data.workflow.publicationsByStatus.published).toBe(1);

    // progress via deriveProgramProgress should be computed (not null)
    expect(data.kpis.progress).toBeTruthy();
    expect(data.kpis.progress).toHaveProperty("percent");
    expect(data.kpis.progress).toHaveProperty("completedUnits");
    expect(data.kpis.progress).toHaveProperty("totalUnits");

    // teamWorkload per user
    expect(data.teamWorkload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "u1", assignedContents: 2, assignedDeliverables: 1 }),
        expect.objectContaining({ userId: "u2", assignedContents: 2, assignedDeliverables: 1 }),
      ]),
    );

    // mailUnread stub
    expect(data.mailUnread).toEqual({ info: 0, support: 0, total: 0 });
  });

  it("counts mail unread via fetchMailUnread and returns total", async () => {
    const deps = makeDeps({
      fetchContentProducts: vi.fn().mockResolvedValue([] as never),
      fetchMailUnread: vi.fn().mockImplementation(async (acc: string) => (acc === "info" ? 3 : 7)),
    });
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    const body = await res.json();
    expect(body.data.mailUnread).toEqual({ info: 3, support: 7, total: 10 });
    expect(deps.fetchMailUnread).toHaveBeenCalledWith("info");
    expect(deps.fetchMailUnread).toHaveBeenCalledWith("support");
  });

  it("handles empty datasets without throwing (zero totals, progress empty)", async () => {
    const deps = makeDeps({
      fetchContentProducts: vi.fn().mockResolvedValue([] as never),
      fetchPrograms: vi.fn().mockResolvedValue([] as never),
      fetchDeliverables: vi.fn().mockResolvedValue([] as never),
      fetchPublications: vi.fn().mockResolvedValue([] as never),
      fetchUsers: vi.fn().mockResolvedValue([] as never),
    });
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kpis.contentProductsTotal).toBe(0);
    expect(body.data.kpis.programsTotal).toBe(0);
    expect(body.data.kpis.progress?.empty).toBe(true);
    // youtube/instagram grace handling
    expect(body.data.youtube).toEqual({ totalViews30d: 0, byChannel: [], topVideos: [] });
    expect(body.data.instagram).toEqual({ status: "awaiting_connection", byPage: [], connectedCount: 0 });
  });

  it("returns youtube summary with totalViews30d, byChannel and topVideos (handles empty gracefully)", async () => {
    const youtube = {
      totalViews30d: 15000,
      byChannel: [
        { channelId: "UC1", label: "کانال یک", views: 10000 },
        { channelId: "UC2", label: "کانال دو", views: 5000 },
      ],
      topVideos: [
        { videoId: "vid1", title: "ویدیو ۱", views: 7000, channel: "کانال یک" },
        { videoId: "vid2", title: "ویدیو ۲", views: 3000, channel: "کانال دو" },
      ],
    };
    const deps = makeDeps({
      fetchYoutubeSummary: vi.fn().mockResolvedValue(youtube as never),
      fetchInstagramSummary: vi.fn().mockResolvedValue({ status: "awaiting_connection", byPage: [], connectedCount: 0 } as never),
    });
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.youtube).toEqual(youtube);
    expect(body.data.youtube.totalViews30d).toBe(15000);
    expect(body.data.youtube.byChannel).toHaveLength(2);
    expect(body.data.youtube.topVideos[0].videoId).toBe("vid1");
    // instagram placeholder
    expect(body.data.instagram.status).toBe("awaiting_connection");
    expect(body.data.instagram.byPage).toEqual([]);
  });

  it("returns instagram placeholder when not connected and connected status when accounts exist", async () => {
    const depsAwaiting = makeDeps({
      fetchInstagramSummary: vi.fn().mockResolvedValue({ status: "awaiting_connection", byPage: [], connectedCount: 0 } as never),
    });
    const res1 = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), depsAwaiting);
    expect((await res1.json()).data.instagram).toEqual({ status: "awaiting_connection", byPage: [], connectedCount: 0 });

    const depsConnected = makeDeps({
      fetchInstagramSummary: vi.fn().mockResolvedValue({ status: "connected", byPage: [{ pageId: "ig1", label: "پیج تست", views: 0 }], connectedCount: 1 } as never),
    });
    const res2 = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), depsConnected);
    const data2 = (await res2.json()).data;
    expect(data2.instagram.status).toBe("connected");
    expect(data2.instagram.byPage).toHaveLength(1);
    expect(data2.instagram.connectedCount).toBe(1);
  });

  it("handles youtube fetch failure gracefully (returns zeros)", async () => {
    const deps = makeDeps({
      fetchYoutubeSummary: vi.fn().mockRejectedValue(new Error("db down")) as never,
      fetchInstagramSummary: vi.fn().mockRejectedValue(new Error("db down")) as never,
    });
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.youtube).toEqual({ totalViews30d: 0, byChannel: [], topVideos: [] });
    expect(body.data.instagram).toEqual({ status: "awaiting_connection", byPage: [], connectedCount: 0 });
  });

  it("falls back to Data API when analytics top empty", async () => {
    const fallbackTop = [
      { videoId: "v1", title: "Fallback Video 1", views: 999, channel: "Emro YT", channelId: "emro" },
      { videoId: "v2", title: "Fallback Video 2", views: 500, channel: "Emro YT", channelId: "emro" },
    ];
    const fetchYoutubeFallback = vi.fn().mockResolvedValue(fallbackTop);
    const deps = makeDeps({
      fetchYoutubeSummary: vi.fn().mockResolvedValue({ totalViews30d: 0, byChannel: [], topVideos: [] } as never),
      fetchYoutubeFallback,
    } as unknown as Partial<DashboardSummaryDependencies>);
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(fetchYoutubeFallback).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data.youtube.topVideos).toEqual(fallbackTop);
  });

  it("does not call fallback when topVideos already present", async () => {
    const fetchYoutubeFallback = vi.fn().mockResolvedValue([]);
    const youtube = {
      totalViews30d: 15000,
      byChannel: [{ channelId: "emro", label: "Emro YT", views: 15000 }],
      topVideos: [{ videoId: "vid1", title: "Existing Top", views: 7000, channel: "Emro YT" }],
    };
    const deps = makeDeps({
      fetchYoutubeSummary: vi.fn().mockResolvedValue(youtube as never),
      fetchYoutubeFallback,
    } as unknown as Partial<DashboardSummaryDependencies>);
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(fetchYoutubeFallback).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.youtube.topVideos).toEqual(youtube.topVideos);
  });

  it("handles fallback failure gracefully (keeps empty topVideos)", async () => {
    const fetchYoutubeFallback = vi.fn().mockRejectedValue(new Error("quotaExceeded"));
    const deps = makeDeps({
      fetchYoutubeSummary: vi.fn().mockResolvedValue({ totalViews30d: 0, byChannel: [], topVideos: [] } as never),
      fetchYoutubeFallback,
    } as unknown as Partial<DashboardSummaryDependencies>);
    const res = await handleDashboardSummaryRequest(new Request("http://test/api/dashboard/summary"), deps);
    expect(fetchYoutubeFallback).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.youtube.topVideos).toEqual([]);
  });
});
