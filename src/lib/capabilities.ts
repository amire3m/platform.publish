// -----------------------------------------------------------------------------
// Capability configuration.
// -----------------------------------------------------------------------------
// This describes, per platform + content type, which fields/features are
// supported and what upload limits apply. It is intentionally data (not
// scattered `if` statements) so it can be edited from Settings without a code
// change, and so the UI + API can both consult a single source before
// enabling a control or accepting a publish request. Numbers below reflect
// publicly documented limits (Telegram Bot API, YouTube Data API, Instagram
// Graph API) as of this writing; operators should keep them in sync with the
// official docs since providers change limits over time.
// -----------------------------------------------------------------------------

export type Platform = "youtube" | "instagram";

export interface FieldSupport {
  supported: boolean;
  reason?: string; // Persian explanation shown in UI when unsupported
}

export interface ContentTypeCapability {
  label: string;
  maxFileSizeMb: number;
  maxDurationSeconds?: number;
  minDurationSeconds?: number;
  allowedMimeTypes: string[];
  aspectRatios?: string[];
  maxItems?: number; // for carousels
  fields: Record<string, FieldSupport>;
}

export interface PlatformCapability {
  [key: string]: unknown;
  label: string;
  contentTypes: Record<string, ContentTypeCapability>;
}

export const DEFAULT_CAPABILITY_CONFIG: Record<Platform, PlatformCapability> = {
  youtube: {
    label: "یوتیوب",
    contentTypes: {
      video: {
        label: "ویدیوی معمولی",
        maxFileSizeMb: 128 * 1024, // YouTube Data API allows up to 128GB, capped by Telegram relay in practice
        allowedMimeTypes: ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"],
        fields: {
          title: { supported: true },
          description: { supported: true },
          tags: { supported: true },
          category: { supported: true },
          privacyStatus: { supported: true },
          publishAt: { supported: true },
          madeForKids: { supported: true },
          ageRestriction: { supported: false, reason: "تنظیم محدودیت سنی از طریق API عمومی یوتیوب پشتیبانی نمی‌شود." },
          playlist: { supported: true },
          thumbnail: { supported: true },
          language: { supported: true },
          subtitles: { supported: true },
        },
      },
      short: {
        label: "شورتز",
        maxFileSizeMb: 2048,
        maxDurationSeconds: 180,
        allowedMimeTypes: ["video/mp4", "video/quicktime"],
        aspectRatios: ["9:16"],
        fields: {
          title: { supported: true },
          description: { supported: true },
          tags: { supported: true },
          category: { supported: true },
          privacyStatus: { supported: true },
          publishAt: { supported: true },
          madeForKids: { supported: true },
          ageRestriction: { supported: false, reason: "تنظیم محدودیت سنی از طریق API عمومی یوتیوب پشتیبانی نمی‌شود." },
          playlist: { supported: true },
          thumbnail: { supported: false, reason: "یوتیوب برای شورتز، تامبنیل سفارشی را از طریق API پشتیبانی نمی‌کند." },
          language: { supported: true },
          subtitles: { supported: true },
        },
      },
    },
  },
  instagram: {
    label: "اینستاگرام",
    contentTypes: {
      image: {
        label: "پست تصویری",
        maxFileSizeMb: 8,
        allowedMimeTypes: ["image/jpeg", "image/png"],
        aspectRatios: ["1:1", "4:5", "1.91:1"],
        fields: {
          caption: { supported: true },
          hashtags: { supported: true },
          altText: { supported: true },
          cover: { supported: false, reason: "کاور سفارشی فقط برای ریلز پشتیبانی می‌شود." },
          firstComment: { supported: true },
          location: { supported: true },
        },
      },
      carousel: {
        label: "کاروسل",
        maxFileSizeMb: 8,
        maxItems: 10,
        allowedMimeTypes: ["image/jpeg", "image/png", "video/mp4"],
        aspectRatios: ["1:1", "4:5", "1.91:1"],
        fields: {
          caption: { supported: true },
          hashtags: { supported: true },
          altText: { supported: true },
          cover: { supported: false, reason: "کاور سفارشی برای کاروسل از طریق Graph API پشتیبانی نمی‌شود." },
          firstComment: { supported: true },
          location: { supported: true },
        },
      },
      reel: {
        label: "ریل",
        maxFileSizeMb: 4096,
        maxDurationSeconds: 900,
        minDurationSeconds: 3,
        allowedMimeTypes: ["video/mp4", "video/quicktime"],
        aspectRatios: ["9:16"],
        fields: {
          caption: { supported: true },
          hashtags: { supported: true },
          altText: { supported: false, reason: "متن جایگزین برای ریلز از طریق API پشتیبانی نمی‌شود." },
          cover: { supported: true },
          firstComment: { supported: true },
          location: { supported: true },
        },
      },
    },
  },
};

/**
 * Telegram Bot API hard limit for bots without a self-hosted Local Bot API
 * Server (50MB). Override via env when running against a Local Bot API Server
 * (which raises the ceiling to 2GB) — the panel setting `fileSizeLimitMb`
 * takes precedence over this default at upload time.
 */
export const TELEGRAM_BOT_API_FILE_LIMIT_MB = Number(process.env.TELEGRAM_BOT_API_FILE_LIMIT_MB) || 50;
export const TELEGRAM_BOT_API_LOCAL_SERVER_LIMIT_MB = 2000;

export function getContentTypeCapability(
  config: Record<string, PlatformCapability>,
  platform: Platform,
  contentType: string,
): ContentTypeCapability | undefined {
  return config[platform]?.contentTypes?.[contentType];
}

export interface FileValidationInput {
  sizeBytes: number;
  mimeType: string;
  durationSeconds?: number;
  itemCount?: number;
}

export interface FileValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateFileAgainstCapability(
  cap: ContentTypeCapability | undefined,
  input: FileValidationInput,
  telegramLimitMb: number,
): FileValidationResult {
  const errors: string[] = [];
  if (!cap) {
    errors.push("این نوع محتوا برای پلتفرم انتخاب‌شده تعریف نشده است.");
    return { ok: false, errors };
  }
  const sizeMb = input.sizeBytes / (1024 * 1024);
  if (sizeMb > cap.maxFileSizeMb) {
    errors.push(`حجم فایل (${sizeMb.toFixed(1)} مگابایت) از محدودیت مجاز (${cap.maxFileSizeMb} مگابایت) بیشتر است.`);
  }
  if (sizeMb > telegramLimitMb) {
    errors.push(
      `حجم فایل از محدودیت فعلی ربات تلگرام (${telegramLimitMb} مگابایت) بیشتر است. برای فایل‌های بزرگ‌تر باید از سرور محلی API ربات استفاده شود (به راهنمای پروژه مراجعه کنید).`,
    );
  }
  if (!cap.allowedMimeTypes.includes(input.mimeType)) {
    errors.push(`فرمت فایل (${input.mimeType}) مجاز نیست. فرمت‌های مجاز: ${cap.allowedMimeTypes.join("، ")}`);
  }
  if (cap.maxDurationSeconds && input.durationSeconds && input.durationSeconds > cap.maxDurationSeconds) {
    errors.push(`مدت ویدیو نباید بیشتر از ${cap.maxDurationSeconds} ثانیه باشد.`);
  }
  if (cap.minDurationSeconds && input.durationSeconds && input.durationSeconds < cap.minDurationSeconds) {
    errors.push(`مدت ویدیو نباید کمتر از ${cap.minDurationSeconds} ثانیه باشد.`);
  }
  if (cap.maxItems && input.itemCount && input.itemCount > cap.maxItems) {
    errors.push(`حداکثر ${cap.maxItems} آیتم در کاروسل مجاز است.`);
  }
  return { ok: errors.length === 0, errors };
}
