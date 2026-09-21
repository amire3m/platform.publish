import { describe, expect, it, vi, afterEach } from "vitest";
import { contentTypeFromPath, checkFileIdUsable } from "./client";

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
    fetchSpy.mockRestore();
  });
});

describe("checkFileIdUsable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ok for a valid file", async () => {
    const client = { getFile: vi.fn().mockResolvedValue({ file_id: "x" }) } as never;
    await expect(checkFileIdUsable(client, "x")).resolves.toBe("ok");
  });

  it("returns invalid when Telegram rejects the id", async () => {
    const client = { getFile: vi.fn().mockRejectedValue(new Error("Telegram API error (getFile): Bad Request: wrong file_id")) } as never;
    await expect(checkFileIdUsable(client, "bad")).resolves.toBe("invalid");
  });

  it("returns unknown (fail open) when validation is slow", async () => {
    const client = { getFile: vi.fn().mockImplementation(() => new Promise(() => {})) } as never;
    await expect(checkFileIdUsable(client, "x", 30)).resolves.toBe("unknown");
  });

  it("returns unknown on telegram timeouts", async () => {
    const client = { getFile: vi.fn().mockRejectedValue(Object.assign(new Error("Telegram timeout (getFile after 1ms)"), { code: "TELEGRAM_TIMEOUT" })) } as never;
    await expect(checkFileIdUsable(client, "x")).resolves.toBe("unknown");
  });
});

describe("message call timeouts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("send/edit/answer carry an abort signal so hung Bot API calls fail fast", async () => {
    const ok = () => Promise.resolve(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(ok as never);
    const c = new TelegramClient({ botToken: "t", groupId: "-1001" });
    await c.sendMessage("hi");
    await c.editMessageText(1, "hi");
    await c.answerCallbackQuery("qid");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const call of fetchSpy.mock.calls) {
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
    fetchSpy.mockRestore();
  });
});

describe("getFile timeout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails fast with a coded error and never leaks the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("This operation was aborted"), { name: "TimeoutError" })));
    })));
    const c = new TelegramClient({botToken:"secret-token-xyz", groupId:"-1001"});
    const err = await c.getFile("file-1", { timeoutMs: 30 }).catch((e) => e as Error);
    expect((err as { code?: string }).code).toBe("TELEGRAM_TIMEOUT");
    expect(String(err)).not.toContain("secret-token-xyz");
  });
});
