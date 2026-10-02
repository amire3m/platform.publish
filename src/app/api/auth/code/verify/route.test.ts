import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(() => true),
  verifyLoginCode: vi.fn(),
  selectUser: vi.fn(),
  signSession: vi.fn(() => "signed-token"),
  appendAuditEvent: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.selectUser }) }) }),
  },
}));
vi.mock("@/db/schema", () => ({ users: { telegramId: "telegramId" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((a: unknown, b: unknown) => ({ a, b })) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/auth", () => ({ signSession: mocks.signSession, SESSION_COOKIE: "emro_session" }));
vi.mock("@/lib/api-helpers", () => ({
  firstZodIssueMessage: () => "invalid",
  jsonError: (message: string, status = 400, code?: string) => Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown) => Response.json({ ok: true, data }),
  rateLimit: mocks.rateLimit,
  clientKeyFromRequest: () => "test-key",
}));
vi.mock("@/lib/auth/login-codes", () => ({ verifyLoginCode: mocks.verifyLoginCode }));
vi.mock("@/lib/telegram/tgdb", () => ({ appendAuditEvent: mocks.appendAuditEvent }));

import { POST } from "@/app/api/auth/code/verify/route";

function req(body: unknown) {
  return new Request("http://localhost/api/auth/code/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/code/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(true);
  });

  it("signs in a registered active user with a valid code", async () => {
    mocks.verifyLoginCode.mockReturnValue({ ok: true, telegramId: "999" });
    mocks.selectUser.mockResolvedValue([{ id: "USR-1", telegramId: "999", name: "A", role: "publisher", active: true }]);
    const res = await POST(req({ code: "123456" }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mocks.cookieSet).toHaveBeenCalledOnce();
    expect(mocks.appendAuditEvent).toHaveBeenCalledOnce();
  });

  it("rejects invalid codes with 401", async () => {
    mocks.verifyLoginCode.mockReturnValue({ ok: false, reason: "NOT_FOUND" });
    const res = await POST(req({ code: "000000" }));
    expect(res.status).toBe(401);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("rejects expired codes with an explanatory 401", async () => {
    mocks.verifyLoginCode.mockReturnValue({ ok: false, reason: "EXPIRED" });
    const res = await POST(req({ code: "000000" }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain("/login");
  });

  it("rejects unregistered telegram ids with 403", async () => {
    mocks.verifyLoginCode.mockReturnValue({ ok: true, telegramId: "111" });
    mocks.selectUser.mockResolvedValue([]);
    const res = await POST(req({ code: "123456" }));
    expect(res.status).toBe(403);
  });

  it("rejects malformed codes with 422", async () => {
    const res = await POST(req({ code: "12" }));
    expect(res.status).toBe(422);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rate limits brute force", async () => {
    mocks.rateLimit.mockReturnValue(false);
    const res = await POST(req({ code: "123456" }));
    expect(res.status).toBe(429);
  });
});
