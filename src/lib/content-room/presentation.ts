import { UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";

export const PRODUCT_TYPE_LABELS_FA: Record<string, string> = {
  serial: "سریال",
  documentary: "مستند",
  tv_program: "برنامه تلویزیونی",
  film: "فیلم سینمایی",
  short_film: "فیلم کوتاه",
  educational: "آموزشی",
  teaser: "تیزر",
  music_video: "نماهنگ",
};

export const ACTIVITY_LABELS_FA: Record<string, string> = {
  editing_youtube: "تدوین یوتیوب",
  copyright_fix: "رفع کپی‌رایت",
  highlight_done: "هایلایت",
  reel_done: "ریلز",
  cover_ready: "کاور",
  previously_published: "قبلاً منتشر شده",
};

export type ContentStatus =
  | "imported"
  | "editing_youtube"
  | "copyright_fix"
  | "highlight_done"
  | "reel_done"
  | "cover_ready"
  | "ready_to_send"
  | "previously_published";

export interface ContentStatusPresentation {
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  icon: "clock" | "loader" | "eye" | "alert" | "check" | "calendar" | "x";
}

const PRESENTATIONS: Record<string, ContentStatusPresentation> = {
  imported: { label: "واردشده", tone: "neutral", icon: "clock" },
  editing_youtube: { label: "در تدوین یوتیوب", tone: "warning", icon: "loader" },
  copyright_fix: { label: "رفع کپی‌رایت", tone: "warning", icon: "eye" },
  highlight_done: { label: "هایلایت ساخته شد", tone: "info", icon: "check" },
  reel_done: { label: "ریلز ساخته شد", tone: "info", icon: "check" },
  cover_ready: { label: "کاور آماده", tone: "info", icon: "calendar" },
  ready_to_send: { label: "آماده ارسال", tone: "success", icon: "check" },
  previously_published: { label: "قبلاً منتشر شده", tone: "neutral", icon: "check" },
};

export function contentStatusPresentation(status: ContentStatus): ContentStatusPresentation {
  return (
    PRESENTATIONS[status] ?? {
      label: UNKNOWN_LABEL_FA,
      tone: "neutral",
      icon: "clock",
    }
  );
}

// Alias for task spec: workflowStatusPresentation-like mapping for content statuses
export const workflowStatusPresentation = contentStatusPresentation;

export const CONTENT_STATUS_ORDER: Record<ContentStatus, number> = {
  imported: 0,
  editing_youtube: 1,
  copyright_fix: 2,
  highlight_done: 3,
  reel_done: 4,
  cover_ready: 5,
  ready_to_send: 6,
  previously_published: 7,
};

export const CONTENT_STATUSES = [
  "imported",
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "ready_to_send",
] as const;
