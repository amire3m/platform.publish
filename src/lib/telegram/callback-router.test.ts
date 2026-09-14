import { describe, expect, it, vi, beforeEach } from "vitest";

vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s");
vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
vi.stubEnv("TELEGRAM_GROUP_ID", "-1001");
vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/app_db");

// Mock DB to avoid real connection and provide fast empty results (fallback mock products handle test)
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(() => Promise.resolve([])),
          })),
        })),
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
  pool: { query: vi.fn() },
}));

vi.mock("@/lib/telegram/client", () => ({
  TelegramClient: {
    fromEnv: vi.fn(() => ({
      editMessageText: vi.fn().mockResolvedValue({}),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 100 }),
      getFile: vi.fn().mockResolvedValue({ file_id: "abc", file_path: "path/video.mp4" }),
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    })),
  },
  getTelegramConfig: vi.fn(() => ({ botToken: "test-token", groupId: "-1001" })),
  contentTypeFromPath: vi.fn(() => null),
}));

vi.mock("@/lib/content-room/repository", () => ({
  contentRoomRepository: {
    createProduct: vi.fn().mockResolvedValue({ id: "CPR-99", title: "My Title" }),
  },
}));

describe("link_existing", () => {
  it("shows product picker for link_existing", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_existing", "123", "999");
    expect(res.ok).toBe(true);
  }, 20000);

  it("handles pagination via link_existing with page", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_existing", "123:1", "999");
    expect(res.ok).toBe(true);
  });

  it("shows part picker for link_pick_product", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_pick_product", "123:CPR-1:0", "999");
    expect(res.ok).toBe(true);
  });

  it("shows kind picker for link_pick_part", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_pick_part", "123:CPP-1", "999");
    expect(res.ok).toBe(true);
  });

  it("kind picker has a back button to the previous step", async () => {
    const { TelegramClient } = await import("./client");
    const mockEdit = vi.fn().mockResolvedValue({});
    const mockSend = vi.fn().mockResolvedValue({ message_id: 102 });
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce({
      editMessageText: mockEdit,
      sendMessage: mockSend,
      getFile: vi.fn(),
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    } as never);
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_pick_part", "123:CPP-1", "999", 100);
    expect(res.ok).toBe(true);
    const kb = mockEdit.mock.calls[0][2] as { replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> } };
    const lastRow = kb.replyMarkup.inline_keyboard[kb.replyMarkup.inline_keyboard.length - 1];
    expect(lastRow[0].callback_data).toMatch(/^link_(pick_product|existing):123/);
  });

  it("links file via link_pick_kind", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_pick_kind", "123:CPP-1:highlight", "999");
    expect(res.ok).toBe(true);
  });

  it("handles link_new force_reply", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_new", "123", "999");
    expect(res.ok).toBe(true);
  });

  it("arms product search via link_search", async () => {
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_search", "123", "999");
    expect(res.ok).toBe(true);
    const { getPendingSearch } = await import("@/lib/content-room/pending-search");
    expect(getPendingSearch("999")?.messageId).toBe("123");
  });

  it("sends the search prompt to the same topic", async () => {
    const { TelegramClient } = await import("./client");
    const mockSend = vi.fn().mockResolvedValue({ message_id: 101 });
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValueOnce({
      editMessageText: vi.fn().mockResolvedValue({}),
      sendMessage: mockSend,
      getFile: vi.fn(),
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    } as never);
    const { routeCallback } = await import("./callback-router");
    const res = await routeCallback("link_search", "123", "999", 100, 42);
    expect(res.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][1]).toBe(42);
  });

  it("completes telegram product creation: title, type, channel", async () => {
    const { TelegramClient } = await import("./client");
    const { db } = await import("@/db");
    const OWNER = { id: "u-tg", telegramId: "999", name: "T", username: null, phone: null, role: "owner", active: true, allowedActions: [], allowedAccountIds: [], allowedChannels: [], avatarUrl: null, isOwnerProtected: false, createdAt: new Date(), updatedAt: new Date() };
    const userChain = { from: () => ({ where: () => ({ limit: () => Promise.resolve([OWNER]) }) }) };
    const mockSend = vi.fn().mockResolvedValue({ message_id: 200 });
    const clientMock = {
      editMessageText: vi.fn().mockResolvedValue({}),
      sendMessage: mockSend,
      getFile: vi.fn(),
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValue(clientMock as never);
    const selectMock = vi.mocked(db.select as unknown as () => unknown);
    selectMock.mockImplementation(() => userChain as never);

    const mod = await import("./callback-router");
    // step 1: arm via link_new, then reply the title
    const armed = await mod.routeCallback("link_new", "555", "999");
    expect(armed.ok).toBe(true);
    const titled = await mod.handleNewProductTitle("999", "My Title");
    expect(titled.handled).toBe(true);
    const { getPendingNewProduct } = await import("@/lib/content-room/pending-new-product");
    expect(getPendingNewProduct("999")?.title).toBe("My Title");
    // step 2: pick type
    const typed = await mod.routeCallback("link_new_type", "serial", "999");
    expect(typed.ok).toBe(true);
    expect(getPendingNewProduct("999")?.productType).toBe("serial");
    // step 3: pick channel creates the product and opens the part picker
    const { contentRoomRepository } = await import("@/lib/content-room/repository");
    const created = await mod.routeCallback("link_new_channel", "zed_revayat", "999");
    expect(created.ok).toBe(true);
    expect(contentRoomRepository.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Title", productType: "serial", channel: "zed_revayat", partsCount: 1 }),
    );
    expect(getPendingNewProduct("999")).toBeNull();
  });

  it("rejects invalid product type in telegram creation", async () => {
    const { db } = await import("@/db");
    const OWNER = { id: "u-tg", telegramId: "998", name: "T", username: null, phone: null, role: "owner", active: true, allowedActions: [], allowedAccountIds: [], allowedChannels: [], avatarUrl: null, isOwnerProtected: false, createdAt: new Date(), updatedAt: new Date() };
    vi.mocked(db.select as unknown as () => unknown).mockImplementation(
      (() => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([OWNER]) }) }) })) as never,
    );
    const mod = await import("./callback-router");
    await mod.routeCallback("link_new", "556", "998");
    await mod.handleNewProductTitle("998", "T2");
    const res = await mod.routeCallback("link_new_type", "nope", "998");
    expect(res.ok).toBe(false);
  });
});
