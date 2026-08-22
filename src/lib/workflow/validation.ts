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

// Export types
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
