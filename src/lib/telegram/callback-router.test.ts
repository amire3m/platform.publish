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
});
