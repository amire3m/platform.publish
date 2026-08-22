import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/worker", () => ({
  runPublishTick: vi.fn(),
}));
vi.mock("@/lib/analytics/scheduler", () => ({
  runScheduledAnalyticsSync: vi.fn(),
}));
vi.mock("@/lib/workflow/reconciliation", () => ({
  reconcileWorkflowTargets: vi.fn(),
}));
vi.mock("@/lib/workflow/notification-scheduler", () => ({
  runSchedulerTick: vi.fn(),
}));
vi.mock("@/lib/workflow/notifications", () => ({
  runWorkflowNotificationDelivery: vi.fn(),
}));
vi.mock("@/lib/api-helpers", () => ({
  jsonError: (message: string, status = 400) =>
    Response.json({ ok: false, error: message }, { status }),
  jsonOk: (data: unknown) => Response.json({ ok: true, data }),
}));

import { GET, POST } from "@/app/api/cron/tick/route";
import { runScheduledAnalyticsSync } from "@/lib/analytics/scheduler";
import { runPublishTick } from "@/lib/worker";
import { reconcileWorkflowTargets } from "@/lib/workflow/reconciliation";
import { runSchedulerTick } from "@/lib/workflow/notification-scheduler";
import { runWorkflowNotificationDelivery } from "@/lib/workflow/notifications";

describe("/api/cron/tick", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    vi.mocked(runPublishTick).mockResolvedValue({ processed: 2, errors: 0 });
    vi.mocked(runScheduledAnalyticsSync).mockResolvedValue({ ran: true, results: [] });
    vi.mocked(reconcileWorkflowTargets).mockResolvedValue({ reconciled: 0, warnings: 0, processed: 0 });
    vi.mocked(runSchedulerTick).mockResolvedValue({ enqueued: 0 });
    vi.mocked(runWorkflowNotificationDelivery).mockResolvedValue({ delivered: 0, failed: 0, skipped: 0 });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it("rejects an unauthorized POST before either job runs", async () => {
    const response = await POST(new Request("http://localhost/api/cron/tick", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(runPublishTick).not.toHaveBeenCalled();
    expect(runScheduledAnalyticsSync).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await POST(new Request("http://localhost/api/cron/tick", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(runPublishTick).not.toHaveBeenCalled();
    expect(runScheduledAnalyticsSync).not.toHaveBeenCalled();
  });

  it("rejects GET with Allow: POST even when authorized", async () => {
    const response = await GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(runPublishTick).not.toHaveBeenCalled();
  });

  it("returns the authorized same-day analytics skip shape", async () => {
    vi.mocked(runScheduledAnalyticsSync).mockResolvedValue({ ran: false, results: [] });

    const response = await POST(new Request("http://localhost/api/cron/tick", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }));

    expect(await response.json()).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        publish: { ok: true, value: { processed: 2, errors: 0 } },
        analytics: { ok: true, value: { ran: false, results: [] } },
      }),
    }));
  });

  it("returns both publish and analytics results after an authorized run", async () => {
    const analytics = {
      ran: true,
      results: [{ accountId: "account-1", status: "synced" as const, snapshotCount: 3 }],
    };
    vi.mocked(runScheduledAnalyticsSync).mockResolvedValue(analytics);

    const response = await POST(new Request("http://localhost/api/cron/tick", {
      headers: { "x-cron-secret": "cron-secret" },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        publish: { ok: true, value: { processed: 2, errors: 0 } },
        analytics: { ok: true, value: analytics },
      }),
    }));
  });

  it("runs both jobs independently and returns a secret-safe error outcome", async () => {
    vi.mocked(runPublishTick).mockRejectedValue(new Error("publish secret detail"));

    const response = await POST(new Request("http://localhost/api/cron/tick", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }));
    const body = await response.json();

    expect(runScheduledAnalyticsSync).toHaveBeenCalledOnce();
    expect(body.data.publish).toEqual({ ok: false, error: "Publish job failed." });
    expect(body.data.analytics).toEqual({ ok: true, value: { ran: true, results: [] } });
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });

  it("runs workflow jobs independently and returns notifications failure without affecting publish", async () => {
    vi.mocked(runWorkflowNotificationDelivery).mockRejectedValue(new Error("notif secret"));
    vi.mocked(reconcileWorkflowTargets).mockResolvedValue({ reconciled: 1, warnings: 0, processed: 1 });

    const response = await POST(new Request("http://localhost/api/cron/tick", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }));
    const body = await response.json();

    expect(runPublishTick).toHaveBeenCalledOnce();
    expect(reconcileWorkflowTargets).toHaveBeenCalledOnce();
    expect(runWorkflowNotificationDelivery).toHaveBeenCalledOnce();
    expect(body.data.publish.ok).toBe(true);
    expect(body.data.notifications.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("notif secret");
  });
});
