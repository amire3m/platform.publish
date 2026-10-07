/**
 * Single source of truth for content-room product statuses.
 *
 * Flow order: imported → copyright_fix → highlight_done → reel_done →
 * cover_ready → ready_to_send. `previously_published` is a terminal marker
 * outside the send flow.
 *
 * Every other module (presentation, validation, repository, room-model,
 * dashboard) must import from here — never redefine these lists.
 */

export const CONTENT_STATUSES = [
  "imported",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "ready_to_send",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export type TerminalStatus = "previously_published";

export type AnyContentStatus = ContentStatus | TerminalStatus;

export const CONTENT_STATUS_ORDER: Record<AnyContentStatus, number> = {
  imported: 0,
  copyright_fix: 1,
  highlight_done: 2,
  reel_done: 3,
  cover_ready: 4,
  ready_to_send: 5,
  previously_published: 6,
};

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";
export type StatusIcon = "clock" | "loader" | "eye" | "alert" | "check" | "calendar" | "x";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  icon: StatusIcon;
}

export const STATUS_META: Record<AnyContentStatus, StatusMeta> = {
  imported: { label: "واردشده", tone: "neutral", icon: "clock" },
  copyright_fix: { label: "رفع کپی‌رایت", tone: "warning", icon: "eye" },
  highlight_done: { label: "هایلایت ساخته شد", tone: "info", icon: "check" },
  reel_done: { label: "ریلز ساخته شد", tone: "info", icon: "check" },
  cover_ready: { label: "کاور آماده", tone: "info", icon: "calendar" },
  ready_to_send: { label: "آماده ارسال", tone: "success", icon: "check" },
  previously_published: { label: "قبلاً منتشر شده", tone: "neutral", icon: "check" },
};

export const STATUS_LABELS_FA: Record<AnyContentStatus, string> = Object.fromEntries(
  (Object.entries(STATUS_META) as Array<[AnyContentStatus, StatusMeta]>).map(([k, v]) => [k, v.label]),
) as Record<AnyContentStatus, string>;
