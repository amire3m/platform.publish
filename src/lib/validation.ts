import { z } from "zod";

export const platformTargetSchema = z.object({
  platform: z.enum(["youtube", "instagram"]),
  accountId: z.string().min(1),
  contentType: z.string().min(1),
  status: z.string().default("draft"),
  publishAtJalali: z.string().nullable().optional(),
  publishAtUtc: z.string().nullable().optional(),
  fields: z.record(z.string(), z.any()).default({}),
});

export const createContentSchema = z.object({
  title: z.string().max(200).default(""),
  description: z.string().max(5000).default(""),
  caption: z.string().max(4000).default(""),
  hashtags: z.array(z.string()).default([]),
  platformTargets: z.array(platformTargetSchema).min(1, "حداقل یک پلتفرم مقصد باید انتخاب شود."),
  status: z.enum(["draft", "in_review", "scheduled"]).default("draft"),
  scheduledAtJalali: z.string().nullable().optional(),
  scheduledAtUtc: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).default([]),
});

export const updateContentSchema = createContentSchema.partial();

export const createUserSchema = z.object({
  telegramId: z.string().min(1, "شناسه تلگرام الزامی است."),
  name: z.string().min(1, "نام الزامی است."),
  username: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["owner", "manager", "editor", "publisher", "analyst", "viewer"]).default("viewer"),
  allowedAccountIds: z.array(z.string()).default([]),
  allowedActions: z.array(z.string()).default([]),
});

export const updateUserSchema = createUserSchema.partial().extend({
  active: z.boolean().optional(),
});

export const socialAccountConnectSchema = z.object({
  mode: z.enum(["mock", "oauth"]).default("mock"),
  username: z.string().min(1),
  displayName: z.string().min(1),
  topicId: z.string().optional(),
});

export const rescheduleSchema = z.object({
  scheduledAtJalali: z.string().min(1),
  scheduledAtUtc: z.string().min(1),
  platform: z.enum(["youtube", "instagram"]).optional(),
});

export const bulkRescheduleSchema = z.object({
  items: z
    .array(
      z.object({
        contentId: z.string(),
        scheduledAtJalali: z.string(),
        scheduledAtUtc: z.string(),
      }),
    )
    .min(1),
});
