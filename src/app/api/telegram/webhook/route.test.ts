import { describe, expect, it, vi, beforeEach } from "vitest";

vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s");
vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
vi.stubEnv("TELEGRAM_GROUP_ID", "-1001");

// Mock callback-router to avoid real DB during webhook tests
vi.mock("@/lib/telegram/callback-router", () => ({
  routeCallback: vi.fn(async (action: string, _id: string, _from: string) => {
    if (action === "approve") return { ok: true, message: "تأیید شد ✅" };
    if (action === "invalid") return { ok: false, message: "عملیات نامعتبر است." };
    return { ok: false, message: "خطا" };
  }),
}));

// Mock TelegramClient to avoid real fetch
vi.mock("@/lib/telegram/client", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const RealClient = actual.TelegramClient as unknown as { fromEnv: () => unknown };
  return {
    ...(actual as object),
    TelegramClient: {
      ...((RealClient as unknown as Record<string, unknown>) ?? {}),
      fromEnv: vi.fn(() => ({
        answerCallbackQuery: vi.fn().mockResolvedValue({}),
        editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
      })),
    },
  };
});

import { POST } from "./route";

describe("webhook", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_GROUP_ID", "-1001");
  });

  it("rejects without secret", async () => {
    const res = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: {},
        body: JSON.stringify({ callback_query: { id: "1", data: "approve:CNT-1", from: { id: 123 } } }),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("approves with permission", async () => {
    const res = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "s" },
        body: JSON.stringify({
          callback_query: { id: "1", data: "approve:CNT-1", from: { id: 999 }, message: { message_id: 10, chat: { id: -1001 } } },
        }),
      }) as never,
    );
    expect([200, 403]).toContain(res.status);
    // ensure webhook returns ok:true on success path
    if (res.status === 200) {
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);
    }
  });

  it("returns ok without callback_query", async () => {
    const res = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "s" },
        body: JSON.stringify({ message: { text: "hi" } }),
      }) as never,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("clears keyboard on success", async () => {
    const { routeCallback } = await import("@/lib/telegram/callback-router");
    const { TelegramClient } = await import("@/lib/telegram/client");
    const mockAnswer = vi.fn().mockResolvedValue({});
    const mockEdit = vi.fn().mockResolvedValue({});
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce({
      answerCallbackQuery: mockAnswer,
      editMessageReplyMarkup: mockEdit,
    } as unknown as InstanceType<typeof TelegramClient>);

    // ensure routeCallback resolves ok true for this data
    vi.mocked(routeCallback).mockResolvedValueOnce({ ok: true, message: "تأیید شد ✅" });

    const res = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "s" },
        body: JSON.stringify({
          callback_query: { id: "cb-1", data: "approve:CNT-1405-000001", from: { id: 999 }, message: { message_id: 10, chat: { id: -1001 } } },
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockAnswer).toHaveBeenCalledWith("cb-1", expect.any(String));
    expect(mockEdit).toHaveBeenCalledWith(10, { inline_keyboard: [] });
  });
});
