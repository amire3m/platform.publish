import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: (...args: unknown[]) => mocks.select(...args) },
}));
vi.mock("@/db/schema", () => ({
  content: { id: "id", scheduledAtUtc: "scheduledAtUtc" },
  workflowDeliverables: { id: "id", programId: "programId" },
  workflowPrograms: { id: "id" },
  workflowPublications: { deliverableId: "deliverableId", scheduledAt: "scheduledAt", status: "status" },
}));
vi.mock("@/lib/api-helpers", () => ({
  requirePermission: mocks.requirePermission,
  jsonError: (message: string, status = 400, code?: string) =>
    Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
}));
vi.mock("@/lib/permissions", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/permissions")>();
  return { ...mod, canAccessAccount: () => true, hasPermission: () => true };
});

import { GET } from "@/app/api/calendar/route";

const user = { id: "user-1", telegramId: "tg-1", role: "owner", allowedActions: [], allowedAccountIds: [] };

function req(search = "") {
  return new Request(`http://localhost/api/calendar${search}`);
}

function mockEmptyCalendarQueries() {
  mocks.select
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
    .mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
      }),
    });
}

describe("GET /api/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ user, response: null });
  });

  it("lists scheduled workflow publications alongside legacy content events", async () => {
    const legacyRow = {
      id: "CNT-1",
      title: "Legacy",
      scheduledAtUtc: new Date("2026-10-05T10:00:00Z"),
      scheduledAtJalali: "1405/07/13 13:30",
      status: "scheduled",
      approvalStatus: "approved",
      error: null,
      media: [],
      platformTargets: [
        {
          platform: "youtube",
          account_id: "ACC-1405-398046",
          content_type: "full_video",
          status: "scheduled",
          publish_at_utc: "2026-10-05T10:00:00.000Z",
          publish_at_jalali: "1405/07/13 13:30",
        },
      ],
    };
    const joinRows = [
      {
        pub: {
          id: "WPB-1",
          platform: "youtube",
          socialAccountId: "ACC-1405-398046",
          status: "scheduled",
          scheduledAt: new Date("2026-10-06T12:00:00Z"),
          lastErrorMessage: null,
        },
        deliverable: { id: "WDL-1", name: "زاویه - قسمت 1 - یوتیوب کامل", kind: "youtube_full", productionStatus: "ready" },
        program: { id: "WPR-1", title: "زاویه صفر درجه", seriesName: "film / zaviye_no", archivedAt: null },
      },
      {
        pub: {
          id: "WPB-2",
          platform: "instagram",
          socialAccountId: null,
          status: "scheduled",
          scheduledAt: new Date("2026-10-06T18:00:00Z"),
          lastErrorMessage: null,
        },
        deliverable: { id: "WDL-2", name: "زاویه - قسمت 1 - ریلز", kind: "reel", productionStatus: "ready" },
        program: { id: "WPR-1", title: "زاویه صفر درجه", seriesName: "film / zaviye_no", archivedAt: null },
      },
    ];

    mocks.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [legacyRow] }) })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({ where: () => ({ limit: async () => joinRows }) }),
          }),
        }),
      });

    const res = await GET(req());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(18);

    const wfYoutube = body.data.find((e: { publicationId: string }) => e.publicationId === "WPB-1");
    expect(wfYoutube).toMatchObject({
      title: "زاویه - قسمت 1 - یوتیوب کامل",
      platform: "youtube",
      accountId: "ACC-1405-398046",
      channel: "zaviye_no",
      status: "scheduled",
      publishAtUtc: "2026-10-06T12:00:00.000Z",
    });
    // Slash format the month grid parses: "YYYY/MM/DD HH:mm"
    expect(wfYoutube.publishAtJalali).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);

    const wfInsta = body.data.find((e: { publicationId: string }) => e.publicationId === "WPB-2");
    expect(wfInsta).toMatchObject({ platform: "instagram", channel: "zaviye_no" });
  });

  it("skips archived workflow programs", async () => {
    mocks.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [
                  {
                    pub: { id: "WPB-X", platform: "youtube", socialAccountId: "ACC-1405-398046", status: "scheduled", scheduledAt: new Date(), lastErrorMessage: null },
                    deliverable: { id: "WDL-X", name: "X", kind: "youtube_full", productionStatus: "ready" },
                    program: { id: "WPR-X", title: "X", seriesName: "film / zaviye_no", archivedAt: new Date() },
                  },
                ],
              }),
            }),
          }),
        }),
      });

    const res = await GET(req());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(15);
    expect(body.data.some((event: { publicationId?: string }) => event.publicationId === "WPB-X")).toBe(false);
  });

  it("merges the 15 approved display-only events with stable Tehran timestamps", async () => {
    mockEmptyCalendarQueries();

    const res = await GET(req());
    const body = await res.json();
    const planEvents = body.data.filter((event: { source?: string }) => event.source === "plan");

    expect(planEvents).toHaveLength(15);
    expect(new Set(planEvents.map((event: { displayId: string }) => event.displayId)).size).toBe(15);
    expect(planEvents.map((event: {
      displayId: string;
      publishAtJalali: string;
      publishAtUtc: string;
      title: string;
      channel: string;
    }) => [event.displayId, event.publishAtJalali, event.publishAtUtc, event.title, event.channel])).toEqual([
      ["plan-1405-08-02-01", "1405/08/02 11:00", "2026-10-24T07:30:00Z", "برنامه بلندگو", "zaviye_no"],
      ["plan-1405-08-02-02", "1405/08/02 11:00", "2026-10-24T07:30:00Z", "برنامه بلندگو", "zed_revayat"],
      ["plan-1405-08-02-03", "1405/08/02 13:00", "2026-10-24T09:30:00Z", "مستندهای ضد روایت", "zed_revayat"],
      ["plan-1405-08-03-01", "1405/08/03 17:00", "2026-10-25T13:30:00Z", "برنامه زاویه صفر درجه", "zaviye_no"],
      ["plan-1405-08-03-02", "1405/08/03 19:00", "2026-10-25T15:30:00Z", "سریال مشاور", "tamashin"],
      ["plan-1405-08-04-01", "1405/08/04 09:00", "2026-10-26T05:30:00Z", "برش‌های سریال مشاور", "tamashin"],
      ["plan-1405-08-04-02", "1405/08/04 13:00", "2026-10-26T09:30:00Z", "مستندهای ضد روایت", "zed_revayat"],
      ["plan-1405-08-05-01", "1405/08/05 09:00", "2026-10-27T05:30:00Z", "ریلزهای مشاور", "tamashin"],
      ["plan-1405-08-05-02", "1405/08/05 12:00", "2026-10-27T08:30:00Z", "برش‌های زاویه صفر درجه", "zaviye_no"],
      ["plan-1405-08-06-01", "1405/08/06 11:00", "2026-10-28T07:30:00Z", "برنامه بلندگو", "zaviye_no"],
      ["plan-1405-08-06-02", "1405/08/06 11:00", "2026-10-28T07:30:00Z", "برنامه بلندگو", "zed_revayat"],
      ["plan-1405-08-06-03", "1405/08/06 13:00", "2026-10-28T09:30:00Z", "مستندهای ضد روایت", "zed_revayat"],
      ["plan-1405-08-07-01", "1405/08/07 10:30", "2026-10-29T07:00:00Z", "ریلز زاویه صفر درجه", "zaviye_no"],
      ["plan-1405-08-07-02", "1405/08/07 19:00", "2026-10-29T15:30:00Z", "سریال مشاور", "tamashin"],
      ["plan-1405-08-08-01", "1405/08/08 10:00", "2026-10-30T06:30:00Z", "برش و ریلز مشاور", "tamashin"],
    ]);
    expect(planEvents[0]).toMatchObject({
      source: "plan",
      contentId: null,
      publicationId: null,
      platform: "youtube",
      accountId: "ACC-1405-398046",
      channelLabel: "زاویه نو",
      contentType: "plan",
      status: "planned",
      contentStatus: "planned",
      approvalStatus: null,
      hasError: false,
      thumbnailAvailable: false,
    });
    expect(Object.fromEntries(planEvents.map((event: { channel: string; accountId: string }) => [event.channel, event.accountId]))).toEqual({
      zaviye_no: "ACC-1405-398046",
      zed_revayat: "ACC-1405-688518",
      tamashin: "ACC-1405-724040",
    });
  });

  it("applies platform and channel filters to display-only events", async () => {
    mockEmptyCalendarQueries();

    const res = await GET(req("?platform=youtube&channel=zaviye_no"));
    const body = await res.json();

    expect(body.data).toHaveLength(5);
    expect(body.data.every((event: { source: string; platform: string; channel: string }) =>
      event.source === "plan" && event.platform === "youtube" && event.channel === "zaviye_no"
    )).toBe(true);
  });
});
