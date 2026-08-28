import { describe, expect, it, vi } from "vitest";
import { contentTypeFromPath } from "./client";

describe("contentTypeFromPath", () => {
  it("recognizes browser-playable video formats", () => {
    expect(contentTypeFromPath("videos/file.mp4")).toBe("video/mp4");
    expect(contentTypeFromPath("documents/file.webm")).toBe("video/webm");
    expect(contentTypeFromPath("documents/file.mov")).toBe("video/quicktime");
  });

  it("returns null for unknown file extensions", () => {
    expect(contentTypeFromPath("documents/file.bin")).toBeNull();
  });
});

vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
vi.stubEnv("TELEGRAM_GROUP_ID", "-1001");
import { TelegramClient } from "./client";
describe("client glass", () => {
  it("sends HTML with inline keyboard", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ok:true, result:{message_id:1}}), {status:200}));
    const c = new TelegramClient({botToken:"t", groupId:"-1001"});
    await c.sendMessage("<b>سلام</b>", 123, {parseMode:"HTML", replyMarkup:{inline_keyboard:[[{text:"تأیید ✅", callback_data:"approve:CNT-1"}]]}});
    expect(fetchSpy).toHaveBeenCalled();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parse_mode).toBe("HTML");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("approve:CNT-1");
  });
});
