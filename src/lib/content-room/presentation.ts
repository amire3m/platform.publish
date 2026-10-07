import { UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";
import {
  STATUS_META,
  type AnyContentStatus,
  type StatusIcon,
  type StatusTone,
} from "./statuses";
import { ACTIVITY_LABELS_FA as CANONICAL_ACTIVITY_LABELS } from "./activities";

export type { ContentStatus, AnyContentStatus, StatusTone, StatusIcon } from "./statuses";
export {
  CONTENT_STATUSES,
  CONTENT_STATUS_ORDER,
  STATUS_META,
  STATUS_LABELS_FA,
} from "./statuses";

export const PRODUCT_TYPE_LABELS_FA: Record<string, string> = {
  serial: "سریال",
  documentary: "مستند",
  tv_program: "برنامه تلویزیونی",
  film: "فیلم سینمایی",
  short_film: "فیلم کوتاه",
  educational: "آموزشی",
  teaser: "تیزر",
  music_video: "نماهنگ",
  raw_video: "ویدیو خام",
};

/** Canonical activity labels (re-exported single source). */
export const ACTIVITY_LABELS_FA: Record<string, string> = CANONICAL_ACTIVITY_LABELS;

export interface ContentStatusPresentation {
  label: string;
  tone: StatusTone;
  icon: StatusIcon;
}

const PRESENTATIONS: Record<string, ContentStatusPresentation> = STATUS_META;

export function contentStatusPresentation(status: AnyContentStatus): ContentStatusPresentation {
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
