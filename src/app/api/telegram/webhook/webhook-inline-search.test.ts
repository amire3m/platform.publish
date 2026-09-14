import { describe, expect, it, vi, beforeEach } from "vitest";

vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s");
vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
vi.stubEnv("TELEGRAM_GROUP_ID", "-1001");
vi.stubEnv("APP_BASE_URL", "http://localhost:3000");

vi.mock("@/lib/telegram/callback-router", () => ({
  routeCallback: vi.fn(async () => ({ ok: false, message: "error" })),
  hasLinkPermission: vi.fn(() => true),
  handleNewProductTitle: vi.fn(async () => ({ handled: false })),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    })),
    insert: () => ({ values: () => Promise.resolve() }),
  },
}));
vi.mock("@/db/schema", () => ({
  workflowEvents: {},
  users: { telegramId: "telegram_id" },
  contentProducts: { id: "id", title: "title", createdAt: "created_at" },
}));
vi.mock("@/lib/telegram/client", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...(actual as object),
    TelegramClient: {
      fromEnv: vi.fn(() => ({
        answerCallbackQuery: vi.fn().mockResolvedValue({}),
        editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
        answerInlineQuery: vi.fn().mockResolvedValue({}),
        sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      })),
    },
  };
});

import { POST } from "./route";

function inlineReq(query: string, from = 999) {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "s" },
    body: JSON.stringify({ inline_query: { id: "iq-1", from: { id: from }, query } }),
  }) as never;
}

function mockClient(answerInlineQuery: ReturnType<typeof vi.fn>, sendMessage = vi.fn().mockResolvedValue({ message_id: 1 })) {
  return {
    answerInlineQuery,
    sendMessage,
    answerCallbackQuery: vi.fn().mockResolvedValue({}),
    editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
  };
}

function mockSelectOnce(resolved: unknown) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(resolved),
        orderBy: () => ({ limit: () => Promise.resolve(resolved) }),
      }),
    }),
  };
}

const OWNER = { id: "u1", telegramId: "999", active: true, role: "owner", allowedActions: [], allowedAccountIds: [] };

describe("webhook inline product search", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_GROUP_ID", "-1001");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  });

  it("answers empty results for unknown users", async () => {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const mockAnswer = vi.fn().mockResolvedValue({});
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce(mockClient(mockAnswer) as never);
    const res = await POST(inlineReq("test-query"));
    expect(res.status).toBe(200);
    expect(mockAnswer).toHaveBeenCalledWith("iq-1", [], undefined);
  });

  it("prompts on empty query for known users", async () => {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const { db } = await import("@/db");
    const mockAnswer = vi.fn().mockResolvedValue({});
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce(mockClient(mockAnswer) as never);
    vi.mocked(db.select as unknown as () => unknown).mockReturnValueOnce(mockSelectOnce([OWNER]));
    const res = await POST(inlineReq("   "));
    expect(res.status).toBe(200);
    expect(mockAnswer).toHaveBeenCalledWith("iq-1", [], expect.objectContaining({ switchPmText: expect.any(String) }));
  });

  it("returns matching products for known users", async () => {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const { db } = await import("@/db");
    const mockAnswer = vi.fn().mockResolvedValue({});
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce(mockClient(mockAnswer) as never);
    const selectMock = vi.mocked(db.select as unknown as () => unknown);
    selectMock.mockReturnValueOnce(mockSelectOnce([OWNER]));
    selectMock.mockReturnValueOnce(
      mockSelectOnce([{ id: "CPR-1", title: "test product", productType: "serial", channel: "zed_revayat", status: "imported", partsCount: 2 }]),
    );
    const res = await POST(inlineReq("test"));
    expect(res.status).toBe(200);
    expect(mockAnswer).toHaveBeenCalledTimes(1);
    const results = mockAnswer.mock.calls[0][1] as Array<{ id: string; title: string }>;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("CPR-1");
  });

  it("searches products from picker text replies with pending state", async () => {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const { db } = await import("@/db");
    const { setPendingSearch } = await import("@/lib/content-room/pending-search");
    const mockSend = vi.fn().mockResolvedValue({ message_id: 2 });
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce(mockClient(vi.fn(), mockSend) as never);
    setPendingSearch("999", { messageId: "555" });
    const selectMock = vi.mocked(db.select as unknown as () => unknown);
    selectMock.mockReturnValueOnce(mockSelectOnce([OWNER]));
    selectMock.mockReturnValueOnce(
      mockSelectOnce([{ id: "CPR-9", title: "matching product", productType: "film", channel: "tamashin", status: "imported", partsCount: 1 }]),
    );
    const res = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "s" },
        body: JSON.stringify({ message: { message_id: 77, chat: { id: -1001, type: "supergroup" }, from: { id: 999 }, text: "match" } }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const opts = mockSend.mock.calls[0][2] as { replyMarkup: { inline_keyboard: Array<Array<{ callback_data?: string }>> } };
    expect(opts.replyMarkup.inline_keyboard[0][0].callback_data).toBe("link_pick_product:555:CPR-9:0");
  });
});
