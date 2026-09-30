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

function req() {
  return new Request("http://localhost/api/calendar");
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
    expect(body.data).toHaveLength(3);

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
    expect(body.data).toHaveLength(0);
  });
});
