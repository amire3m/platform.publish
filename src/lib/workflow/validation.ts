import { z } from "zod";

// Helper for nullable optional trimmed string max
function isoDatetimeNullable() {
  // Zod 4 has z.iso.datetime; fallback to string().datetime for compat
  const base = (z as unknown as { iso?: { datetime: () => z.ZodString } }).iso?.datetime?.() ?? z.string().datetime({ offset: true });
  // allow null and optional, and also accept empty? Use nullable().optional()
  return base.nullable().optional();
}

export const createProgramSchema = z.object({
  title: z.string().trim().min(1).max(200),
  seriesName: z.string().trim().max(200).nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  dueAt: isoDatetimeNullable(),
  notes: z.string().max(4000).nullable().optional(),
  templateId: z.string().optional(),
});

export const updateProgramSchema = createProgramSchema
  .omit({ templateId: true })
  .partial()
  .extend({ expectedVersion: z.number().int().positive() });

// --- Template schemas ---

const templateDestinationSchema = z.object({
  platform: z.enum(["telegram", "youtube", "instagram"]),
  socialAccountId: z.string().nullable().optional(),
});

const templateItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.string().trim().max(50).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  destinations: z.array(templateDestinationSchema).optional(),
  dueOffsetMinutes: z.number().int().nullable().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  items: z.array(templateItemSchema).optional(),
});

export const updateTemplateSchema = createTemplateSchema
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .optional();

// --- Deliverable schemas ---
export const createDeliverableSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.string().trim().max(50).nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  dueAt: isoDatetimeNullable(),
  notes: z.string().max(4000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateDeliverableSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  kind: z.string().trim().max(50).nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  dueAt: isoDatetimeNullable(),
  notes: z.string().max(4000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  expectedVersion: z.number().int().positive(),
});

export const reorderDeliverablesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const transitionDeliverableSchema = z.object({
  action: z.enum(["start", "submit_review", "request_changes", "approve", "reopen", "cancel", "restore"]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000).optional(),
});

export const transitionPublicationSchema = z.object({
  action: z.enum([
    "prepare",
    "schedule",
    "claim_publish",
    "publish_succeeded",
    "publish_failed",
    "cancel_schedule",
    "suppress",
    "restore_suppressed",
    "manual_publish",
    "override_terminal_status",
  ]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000).optional(),
  publishedAt: isoDatetimeNullable(),
  overrideTo: z.enum(["active", "do_not_publish"]).optional(),
  automaticTargetReady: z.boolean().optional(),
});

export const historyQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorUserId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Export types
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>;
export type UpdateDeliverableInput = z.infer<typeof updateDeliverableSchema>;
export type TransitionDeliverableInput = z.infer<typeof transitionDeliverableSchema>;
export type TransitionPublicationInput = z.infer<typeof transitionPublicationSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
