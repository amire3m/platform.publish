import { describe, expect, it, vi } from "vitest";
import { sendBeautifulWithHidden } from "./tgdb";
describe("dual send", () => {
  it("sends beautiful then hidden", async () => {
    const client = {sendMessage: vi.fn().mockResolvedValue({message_id:1})} as unknown as import("./client").TelegramClient;
    await sendBeautifulWithHidden(client as never, "TGDB|v1\n{}", "<b>زیبا</b>", {inline_keyboard:[]}, 123);
    expect(client.sendMessage).toHaveBeenCalledTimes(2);
    expect((client.sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2].parseMode).toBe("HTML");
    expect((client.sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls[1][2].disableNotification).toBe(true);
  });
});
