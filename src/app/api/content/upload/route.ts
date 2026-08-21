// -----------------------------------------------------------------------------
// POST /api/content/upload
// -----------------------------------------------------------------------------
// The core "Telegram as storage" write path. Steps:
//  1. Validate the caller's permission + validate each uploaded file against
//     the Capability Configuration (src/lib/capabilities.ts) for every
//     platform target requested.
//  2. Send the ORIGINAL file(s) to Telegram as Documents (to avoid Telegram's
//     photo/video re-compression) inside the topic that belongs to the first
//     platform target's account (falls back to the "inbox" topic).
//  3. If a thumbnail was provided, send it as a Photo preview.
//  4. If caption/description exceed a safe inline size, store them as
//     separate Telegram messages in the "captions" topic and keep only their
//     message id in the main record (per spec §4).
//  5. Persist the structured TGDB|v1 metadata message + the local index row
//     via `createContentRecord`.
// The raw file bytes are never written to local disk — everything is streamed
// through memory buffers only for the duration of the request.
// -----------------------------------------------------------------------------
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts, telegramTopics, appSettings, content as contentTable } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { TelegramClient, TelegramNotConfiguredError } from "@/lib/telegram/client";
import { createContentRecord } from "@/lib/telegram/tgdb";
import {
  DEFAULT_CAPABILITY_CONFIG,
  TELEGRAM_BOT_API_FILE_LIMIT_MB,
  validateFileAgainstCapability,
  getContentTypeCapability,
  type Platform,
} from "@/lib/capabilities";

export const runtime = "nodejs";

interface IncomingTarget {
  platform: Platform;
  accountId: string;
  contentType: string;
  publishAtJalali?: string | null;
  publishAtUtc?: string | null;
  fields?: Record<string, unknown>;
}

export async function POST(req: Request) {
  const { user, response } = await requirePermission("upload_content");
  if (!user) return response;

  const form = await req.formData();
  const metaRaw = form.get("metadata");
  if (typeof metaRaw !== "string") return jsonError("متادیتا ارسال نشده است.", 400);

  let meta: {
    title: string;
    description: string;
    caption: string;
    hashtags: string[];
    tags?: string[];
    notes?: string;
    platformTargets: IncomingTarget[];
    status: "draft" | "in_review" | "scheduled";
    scheduledAtJalali?: string | null;
    scheduledAtUtc?: string | null;
  };
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return jsonError("متادیتا نامعتبر است.", 400);
  }

  if (!meta.platformTargets?.length) return jsonError("حداقل یک پلتفرم مقصد باید انتخاب شود.", 400);

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return jsonError("هیچ فایلی ارسال نشده است.", 400);

  const [settingsRow] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const capabilityConfig = (settingsRow?.capabilityConfig && Object.keys(settingsRow.capabilityConfig).length > 0
    ? settingsRow.capabilityConfig
    : DEFAULT_CAPABILITY_CONFIG) as unknown as Record<Platform, (typeof DEFAULT_CAPABILITY_CONFIG)["youtube"]>;
  const telegramLimitMb = settingsRow?.fileSizeLimitMb ?? TELEGRAM_BOT_API_FILE_LIMIT_MB;

  // Validate every file against every requested platform target's capability rules.
  const durationSeconds = form.get("durationSeconds") ? Number(form.get("durationSeconds")) : undefined;
  for (const target of meta.platformTargets) {
    const cap = getContentTypeCapability(capabilityConfig, target.platform, target.contentType);
    for (const file of files) {
      const result = validateFileAgainstCapability(
        cap,
        { sizeBytes: file.size, mimeType: file.type, durationSeconds, itemCount: files.length },
        telegramLimitMb,
      );
      if (!result.ok) {
        return jsonError(result.errors.join(" | "), 422, "FILE_VALIDATION_FAILED");
      }
    }
  }

  const primaryTarget = meta.platformTargets[0];
  const [primaryAccount] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, primaryTarget.accountId))
    .limit(1);
  if (!primaryAccount) return jsonError("حساب مقصد یافت نشد.", 404);

  let topicThreadId: number | undefined = primaryAccount.topicMessageThreadId ?? undefined;
  if (!topicThreadId) {
    const [inbox] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "inbox")).limit(1);
    topicThreadId = inbox?.messageThreadId ?? undefined;
  }

  let client: TelegramClient;
  try {
    client = TelegramClient.fromEnv();
  } catch (err) {
    if (err instanceof TelegramNotConfiguredError) {
      return jsonError(
        "اتصال تلگرام پیکربندی نشده است؛ آپلود فایل بدون مخزن تلگرام امکان‌پذیر نیست. ابتدا در تنظیمات، ربات و گروه را متصل کنید.",
        400,
        "TELEGRAM_NOT_CONFIGURED",
      );
    }
    throw err;
  }

  const mediaEntries: Record<string, unknown>[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const sent = await client.sendDocument(buffer, file.name, topicThreadId);
      const fileId =
        sent.document?.file_id ??
        sent.video?.file_id ??
        sent.audio?.file_id ??
        sent.photo?.[0]?.file_id ??
        null;
      if (!fileId) {
        console.error(
          "[upload] sendDocument returned no recognizable media. message_id:",
          sent.message_id,
          "response keys:",
          JSON.stringify(Object.keys(sent)),
          "fileName:",
          file.name,
          "size:",
          file.size,
        );
      }
      mediaEntries.push({
        telegram_message_id: sent.message_id,
        telegram_file_id: fileId,
        topic_id: topicThreadId ?? null,
        file_name: file.name,
        mime_type: file.type,
        size: file.size,
        duration: durationSeconds ?? null,
      });
    } catch (err) {
      return jsonError(`ارسال فایل به تلگرام ناموفق بود: ${(err as Error).message}`, 502, "TELEGRAM_UPLOAD_FAILED");
    }
  }

  let thumbnailMessageId: number | null = null;
  const thumbnailFile = form.get("thumbnail");
  if (thumbnailFile instanceof File) {
    try {
      const buf = Buffer.from(await thumbnailFile.arrayBuffer());
      const sent = await client.sendPhoto(buf, thumbnailFile.name, topicThreadId);
      thumbnailMessageId = sent.message_id;
    } catch (err) {
      console.error("[upload] thumbnail send failed (non-fatal):", (err as Error).message);
    }
  }

  // Long caption/description handling: keep them out of the main JSON blob
  // when they would push the message near Telegram's ~4096 char limit.
  let captionMessageId: number | null = null;
  let captionForRecord = meta.caption ?? "";
  if (captionForRecord.length > 600) {
    const [captionsTopic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "captions")).limit(1);
    try {
      const sent = await client.sendMessage(captionForRecord, captionsTopic?.messageThreadId ?? topicThreadId);
      captionMessageId = sent.message_id;
      captionForRecord = `[در پیام جداگانه ذخیره شد: ${captionMessageId}] ${captionForRecord.slice(0, 120)}...`;
    } catch {
      // fall back to inline storage if the captions topic send fails
    }
  }

  const platformTargets = meta.platformTargets.map((t) => ({
    platform: t.platform,
    account_id: t.accountId,
    content_type: t.contentType,
    status: meta.status === "scheduled" ? "scheduled" : "draft",
    publish_at_jalali: t.publishAtJalali ?? meta.scheduledAtJalali ?? null,
    publish_at_utc: t.publishAtUtc ?? meta.scheduledAtUtc ?? null,
    fields: t.fields ?? {},
    attempts: 0,
  }));

  const { record, telegramSynced } = await createContentRecord({
    title: meta.title ?? "",
    description: meta.description ?? "",
    caption: captionForRecord,
    hashtags: meta.hashtags ?? [],
    platformTargets,
    media: mediaEntries,
    status: meta.status ?? "draft",
    approvalRequired: true,
    createdBy: user.id,
    scheduledAtJalali: meta.scheduledAtJalali ?? null,
    scheduledAtUtc: meta.scheduledAtUtc ?? null,
    sourceTopicId: topicThreadId ?? null,
    tags: meta.tags ?? [],
    notes: meta.notes,
  });

  if (captionMessageId) {
    await db.update(contentTable).set({ captionMessageId }).where(eq(contentTable.id, record.id));
  }
  if (thumbnailMessageId) {
    await db.update(contentTable).set({ thumbnailMessageId }).where(eq(contentTable.id, record.id));
  }

  return jsonOk({ content: record, telegramSynced }, 201);
}
