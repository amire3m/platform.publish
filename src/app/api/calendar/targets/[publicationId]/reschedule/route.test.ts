import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTargetRescheduleRequest } from "./route";
import { WorkflowTargetError } from "@/lib/workflow/target-service";

function futureIso() {
  return new Date(Date.now() + 3600_000).toISOString();
}
function pastIso() {
  return new Date(Date.now() - 3600_000).toISOString();
}

describe("PATCH /api/calendar/targets/:publicationId/reschedule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const scheduleTarget = vi.fn();
    const getPublicationVersion = vi.fn().mockResolvedValue(1);
    const req = new Request("http://test", {
      method: "PATCH",
      body: JSON.stringify({ scheduledAtUtc: futureIso(), scheduledAtJalali: "1405/05/31 13:30" }),
    });
    const res = await handleTargetRescheduleRequest(req, { params: Promise.resolve({ publicationId: "wp1" }) }, {
      getCurrentUser: async () => null,
      scheduleTarget: scheduleTarget as never,
      getPublicationVersion: getPublicationVersion as never,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "ابتدا وارد حساب کاربری خود شوید." });
    expect(scheduleTarget).not.toHaveBeenCalled();
  });

  it("returns 404 when publication not found", async () => {
    const scheduleTarget = vi.fn();
    const req = new Request("http://test", {
      method: "PATCH",
      body: JSON.stringify({ scheduledAtUtc: futureIso(), scheduledAtJalali: "1405/05/31 13:30" }),
    });
    const res = await handleTargetRescheduleRequest(req, { params: Promise.resolve({ publicationId: "missing" }) }, {
      getCurrentUser: async () => ({ id: "u1", telegramId: "t1" }),
      scheduleTarget: scheduleTarget as never,
      getPublicationVersion: async () => null,
    });
    expect(res.status).toBe(404);
    expect(scheduleTarget).not.toHaveBeenCalled();
  });

  it("rejects past scheduledAtUtc", async () => {
    const scheduleTarget = vi.fn();
    const req = new Request("http://test", {
      method: "PATCH",
      body: JSON.stringify({ scheduledAtUtc: pastIso(), scheduledAtJalali: "1400/01/01 10:00" }),
    });
    const res = await handleTargetRescheduleRequest(req, { params: Promise.resolve({ publicationId: "wp1" }) }, {
      getCurrentUser: async () => ({ id: "u1", telegramId: "t1" }),
      scheduleTarget: scheduleTarget as never,
      getPublicationVersion: async () => 1,
    });
    expect(res.status).toBe(400);
    expect(scheduleTarget).not.toHaveBeenCalled();
  });

  it("calls schedulePublicationTarget with publicationId and mirrors only keyed target", async () => {
    const iso = futureIso();
    const jalali = "1405/05/31 13:30";
    const scheduleTarget = vi.fn().mockResolvedValue({ content: {}, publication: { id: "wp1", scheduledAt: iso } });
    const req = new Request("http://test", {
      method: "PATCH",
      body: JSON.stringify({ scheduledAtUtc: iso, scheduledAtJalali: jalali }),
    });
    const res = await handleTargetRescheduleRequest(req, { params: Promise.resolve({ publicationId: "wp1" }) }, {
      getCurrentUser: async () => ({ id: "u1", telegramId: "t1" }),
      scheduleTarget: scheduleTarget as never,
      getPublicationVersion: async () => 2,
    });
    expect(res.status).toBe(200);
    expect(scheduleTarget).toHaveBeenCalledWith({
      publicationId: "wp1",
      scheduledAtUtc: iso,
      scheduledAtJalali: jalali,
      actorUserId: "u1",
      expectedVersion: 2,
    });
  });

  it("maps VERSION_CONFLICT to 409", async () => {
    const iso = futureIso();
    const scheduleTarget = vi.fn().mockRejectedValue(new WorkflowTargetError("VERSION_CONFLICT", "نسخه قدیمی است."));
    const req = new Request("http://test", {
      method: "PATCH",
      body: JSON.stringify({ scheduledAtUtc: iso, scheduledAtJalali: "1405/05/31 13:30" }),
    });
    const res = await handleTargetRescheduleRequest(req, { params: Promise.resolve({ publicationId: "wp1" }) }, {
      getCurrentUser: async () => ({ id: "u1", telegramId: "t1" }),
      scheduleTarget: scheduleTarget as never,
      getPublicationVersion: async () => 1,
    });
    expect(res.status).toBe(409);
  });
});
