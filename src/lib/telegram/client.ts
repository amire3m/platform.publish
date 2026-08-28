// -----------------------------------------------------------------------------
// Low level Telegram Bot API client.
// -----------------------------------------------------------------------------
// Everything here talks directly to https://api.telegram.org using the plain
// HTTP Bot API (fetch + FormData) — no Telegram MTProto client, no scraping.
//
// KNOWN BOT API LIMITATIONS (documented per project requirements):
//  - There is NO Bot API method to *list* existing forum topics of a group.
//    Topics can only be discovered as they are created by the bot
//    (`createForumTopic`) or referenced by a `message_thread_id` that an
//    admin obtains manually (e.g. by opening the topic in Telegram Desktop /
//    "Copy Link" and reading the number at the end of the URL). The Settings
//    → Telegram page therefore supports both "create a new topic via the
//    bot" and "map an existing topic by its numeric id".
//  - The Bot API cannot fetch arbitrary history from before the bot joined,
//    and cannot search all messages in a chat. Full history rebuilding needs
//    either (a) a MTProto "History Adapter" running with a user account in an
//    environment that allows it, or (b) the Export/Import mechanism
//    implemented in `tgdb.ts`, which is what this project ships by default.
//  - Bots (without a self-hosted Local Bot API Server) can only send/receive
//    files up to 50MB via `sendDocument`/`sendVideo` and download files up to
//    20MB via `getFile`. Larger files require a Local Bot API Server (see
//    README "محدودیت‌های API").
// -----------------------------------------------------------------------------

// The standard Bot API limits files to 50MB; a self-hosted Local Bot API
// Server (see README "محدودیت‌های API") raises that to 2GB and can be
// pointed to via TELEGRAM_BOT_API_SERVER_URL (e.g. http://127.0.0.1:8081).
const API_ROOT = process.env.TELEGRAM_BOT_API_SERVER_URL?.trim() || "https://api.telegram.org";

export function contentTypeFromPath(path: string): string | null {
  const extension = path.split("?")[0].split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return extension ? types[extension] ?? null : null;
}

export class TelegramNotConfiguredError extends Error {
  constructor() {
    super("توکن ربات یا شناسه گروه تلگرام تنظیم نشده است.");
    this.name = "TelegramNotConfiguredError";
  }
}

export interface TelegramConfig {
  botToken: string;
  groupId: string;
}

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (!botToken || !groupId) return null;
  return { botToken, groupId };
}

async function callApi<T = unknown>(
  botToken: string,
  method: string,
  body?: Record<string, unknown> | FormData,
  attempt = 1,
): Promise<T> {
  const url = `${API_ROOT}/bot${botToken}/${method}`;
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (attempt < 3) {
      await sleep(400 * attempt);
      return callApi<T>(botToken, method, body, attempt + 1);
    }
    throw err;
  }
  if (res.status === 429 && attempt < 5) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await sleep((retryAfter || 1) * 1000);
    return callApi<T>(botToken, method, body, attempt + 1);
  }
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!json.ok) {
    // Never leak the bot token in error text.
    throw new Error(`Telegram API error (${method}): ${json.description ?? "unknown error"}`);
  }
  return json.result as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TgChat {
  id: number;
  title?: string;
  type: string;
  is_forum?: boolean;
}

export interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  date: number;
  text?: string;
}

export interface TgForumTopic {
  message_thread_id: number;
  name: string;
  icon_color?: number;
}

export class TelegramClient {
  constructor(private cfg: TelegramConfig) {}

  static fromEnv(): TelegramClient {
    const cfg = getTelegramConfig();
    if (!cfg) throw new TelegramNotConfiguredError();
    return new TelegramClient(cfg);
  }

  get groupId() {
    return this.cfg.groupId;
  }

  async getMe() {
    return callApi<{ id: number; username: string; is_bot: boolean }>(this.cfg.botToken, "getMe");
  }

  async getChat(): Promise<TgChat> {
    return callApi<TgChat>(this.cfg.botToken, "getChat", { chat_id: this.cfg.groupId });
  }

  async getChatMember(userId: number | string) {
    return callApi<{ status: string; can_post_messages?: boolean; can_manage_topics?: boolean }>(
      this.cfg.botToken,
      "getChatMember",
      { chat_id: this.cfg.groupId, user_id: userId },
    );
  }

  async testConnection() {
    const me = await this.getMe();
    const chat = await this.getChat();
    let botIsAdmin = false;
    try {
      const member = await this.getChatMember(me.id);
      botIsAdmin = member.status === "administrator" || member.status === "creator";
    } catch {
      botIsAdmin = false;
    }
    return {
      bot: me,
      chat,
      botIsAdmin,
      isSupergroup: chat.type === "supergroup",
      topicsEnabled: Boolean(chat.is_forum),
    };
  }

  async createForumTopic(name: string, iconColor?: number): Promise<TgForumTopic> {
    return callApi<TgForumTopic>(this.cfg.botToken, "createForumTopic", {
      chat_id: this.cfg.groupId,
      name,
      ...(iconColor ? { icon_color: iconColor } : {}),
    });
  }

  async editForumTopic(messageThreadId: number, name: string) {
    return callApi(this.cfg.botToken, "editForumTopic", {
      chat_id: this.cfg.groupId,
      message_thread_id: messageThreadId,
      name,
    });
  }

  async sendMessage(text: string, messageThreadId?: number, opts?: {parseMode?: string, replyMarkup?: {inline_keyboard: unknown[][]}, disableNotification?: boolean}) {
    return callApi<TgMessage>(this.cfg.botToken, "sendMessage", {
      chat_id: this.cfg.groupId,
      text,
      message_thread_id: messageThreadId,
      parse_mode: opts?.parseMode,
      reply_markup: opts?.replyMarkup,
      disable_notification: opts?.disableNotification,
      disable_web_page_preview: true,
    } as unknown as Record<string, unknown>);
  }
  async editMessageText(messageId:number, text:string, opts?: {parseMode?:string, replyMarkup?:unknown}) {
    return callApi(this.cfg.botToken, "editMessageText", {chat_id:this.cfg.groupId, message_id:messageId, text, parse_mode:opts?.parseMode, reply_markup:opts?.replyMarkup});
  }
  async answerCallbackQuery(id:string, text?:string, showAlert=false) {
    return callApi(this.cfg.botToken, "answerCallbackQuery", {callback_query_id:id, text, show_alert:showAlert});
  }
  async editMessageReplyMarkup(messageId:number, replyMarkup: unknown) {
    return callApi(this.cfg.botToken, "editMessageReplyMarkup", {chat_id:this.cfg.groupId, message_id:messageId, reply_markup:replyMarkup});
  }

  async sendPrivateMessage(userTelegramId: string | number, text: string) {
    return callApi<TgMessage>(this.cfg.botToken, "sendMessage", {
      chat_id: userTelegramId,
      text,
      disable_web_page_preview: true,
    });
  }

  async sendDocument(
    fileBuffer: Buffer | Blob,
    fileName: string,
    messageThreadId?: number,
    caption?: string,
  ): Promise<
    TgMessage & {
      document?: { file_id: string; file_unique_id: string; file_size?: number };
      video?: { file_id: string; file_unique_id: string; file_size?: number };
      audio?: { file_id: string; file_unique_id: string; file_size?: number };
      photo?: { file_id: string; file_unique_id: string; file_size?: number }[];
    }
  > {
    const form = new FormData();
    form.set("chat_id", this.cfg.groupId);
    if (messageThreadId) form.set("message_thread_id", String(messageThreadId));
    if (caption) form.set("caption", caption.slice(0, 1024));
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([new Uint8Array(fileBuffer)]);
    form.set("document", blob, fileName);
    return callApi(this.cfg.botToken, "sendDocument", form);
  }

  async sendVideo(
    fileBuffer: Buffer | Blob,
    fileName: string,
    messageThreadId?: number,
    caption?: string,
  ): Promise<TgMessage & { video?: { file_id: string; file_unique_id: string; file_size?: number } }> {
    const form = new FormData();
    form.set("chat_id", this.cfg.groupId);
    if (messageThreadId) form.set("message_thread_id", String(messageThreadId));
    if (caption) form.set("caption", caption.slice(0, 1024));
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([new Uint8Array(fileBuffer)]);
    form.set("video", blob, fileName);
    return callApi(this.cfg.botToken, "sendVideo", form);
  }

  async sendPhoto(
    fileBuffer: Buffer | Blob,
    fileName: string,
    messageThreadId?: number,
    caption?: string,
  ): Promise<TgMessage & { photo?: { file_id: string; file_unique_id: string; file_size?: number }[] }> {
    const form = new FormData();
    form.set("chat_id", this.cfg.groupId);
    if (messageThreadId) form.set("message_thread_id", String(messageThreadId));
    if (caption) form.set("caption", caption.slice(0, 1024));
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([new Uint8Array(fileBuffer)]);
    form.set("photo", blob, fileName);
    return callApi(this.cfg.botToken, "sendPhoto", form);
  }

  async getFile(fileId: string) {
    return callApi<{ file_id: string; file_path?: string; file_size?: number }>(this.cfg.botToken, "getFile", {
      file_id: fileId,
    });
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const info = await this.getFile(fileId);
    if (!info.file_path) throw new Error("مسیر فایل در تلگرام یافت نشد (احتمالاً فایل قدیمی یا حجیم است).");
    const res = await fetch(`${API_ROOT}/file/bot${this.cfg.botToken}/${info.file_path}`);
    if (!res.ok) throw new Error("دریافت فایل از تلگرام ناموفق بود.");
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async downloadFileResponse(fileId: string, range?: string | null): Promise<Response> {
    const info = await this.getFile(fileId);
    if (!info.file_path) throw new Error("مسیر فایل در تلگرام یافت نشد (احتمالاً فایل قدیمی یا حجیم است).");
    const res = await fetch(`${API_ROOT}/file/bot${this.cfg.botToken}/${info.file_path}`, {
      headers: range ? { range } : undefined,
    });
    if (!res.ok && res.status !== 206) throw new Error("دریافت فایل از تلگرام ناموفق بود.");
    const inferredType = contentTypeFromPath(info.file_path);
    if (!inferredType || (res.headers.get("content-type") && res.headers.get("content-type") !== "application/octet-stream")) return res;
    const headers = new Headers(res.headers);
    headers.set("content-type", inferredType);
    return new Response(res.body, { status: res.status, headers });
  }

  async pinMessage(messageId: number) {
    return callApi(this.cfg.botToken, "pinChatMessage", { chat_id: this.cfg.groupId, message_id: messageId });
  }

  buildMessageLink(messageId: number, messageThreadId?: number): string {
    const chatId = this.cfg.groupId.replace("-100", "");
    if (messageThreadId) {
      return `https://t.me/c/${chatId}/${messageThreadId}/${messageId}`;
    }
    return `https://t.me/c/${chatId}/${messageId}`;
  }
}
