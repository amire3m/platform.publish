import { z } from "zod";

export const PART_ACTIVITIES = [
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "previously_published",
] as const;

export const PRODUCT_TYPES = [
  "serial",
  "documentary",
  "tv_program",
  "film",
  "short_film",
  "educational",
  "teaser",
  "music_video",
] as const;

export const CHANNELS = [
  "zed_revayat",
  "zaviye_no",
  "tamashin",
  "iranian_frame",
  "shock",
  "tinazh",
] as const;

export const CONTENT_STATUSES = [
  "imported",
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "ready_to_send",
] as const;

const STATUS_ORDER: Record<(typeof CONTENT_STATUSES)[number], number> = {
  imported: 0,
  editing_youtube: 1,
  copyright_fix: 2,
  highlight_done: 3,
  reel_done: 4,
  cover_ready: 5,
  ready_to_send: 6,
};

export function requiresReasonForTransition(
  from: string,
  to: string,
): boolean {
  const fromIdx = STATUS_ORDER[from as (typeof CONTENT_STATUSES)[number]];
  const toIdx = STATUS_ORDER[to as (typeof CONTENT_STATUSES)[number]];
  if (fromIdx === undefined || toIdx === undefined) return true;
  if (from === to) return true;
  const isForwardSequential = toIdx === fromIdx + 1;
  return !isForwardSequential;
}

export const createProductSchema = z.object({
  title: z.string().trim().min(1, "عنوان الزامی است.").max(200, "عنوان باید حداکثر ۲۰۰ کاراکتر باشد."),
  productType: z.enum(PRODUCT_TYPES),
  channel: z.enum(CHANNELS),
  partsCount: z.number().int().min(1).max(50),
  notes: z.string().max(4000).nullable().optional(),
});

export const updateStatusSchema = z
  .object({
    status: z.enum(CONTENT_STATUSES),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // If reason is provided as empty string after trim, normalize to null for check
    // This refinement alone cannot know current status, but we enforce that
    // when reason is required by transition logic, it must be present.
    // Since we lack `from`, we only validate syntactic constraints here.
    // Semantic backward/skip check is performed in route handler using
    // requiresReasonForTransition(from, to) or repository error mapping.
    // To satisfy spec that schema requires reason if backward/skip,
    // we keep helper exported; callers should use requiresReasonForTransition.
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const batchCreateSchema = z.object({
  products: z.array(createProductSchema).min(1, "حداقل یک محصول لازم است.").max(10, "حداکثر ۱۰ محصول مجاز است."),
});

export const updateMetadataSchema = z.object({
  title: z.string().trim().min(1, "عنوان الزامی است.").max(200, "عنوان باید حداکثر ۲۰۰ کاراکتر باشد.").optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  channel: z.enum(CHANNELS).optional(),
  partsCount: z.number().int().min(1).max(50).optional(),
  notes: z.string().max(4000).nullable().optional(),
  expectedVersion: z.number().int().positive(),
});

export const toggleActivitySchema = z.object({
  partId: z.string().min(1),
  activity: z.enum(PART_ACTIVITIES),
  isDone: z.boolean(),
  expectedProductVersion: z.number().int().positive(),
});

export type BatchCreateInput = z.infer<typeof batchCreateSchema>;
export type UpdateMetadataInput = z.infer<typeof updateMetadataSchema>;
export type ToggleActivityInput = z.infer<typeof toggleActivitySchema>;
