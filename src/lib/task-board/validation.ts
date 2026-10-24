import { z } from "zod";

import { JOB_FUNCTIONS } from "@/lib/job-functions";
import { TASK_COLUMNS } from "./types";

const jobFunctionSchema = z.enum(JOB_FUNCTIONS);
const positiveVersionSchema = z.coerce.number().int().positive("نسخه کار نامعتبر است.");
const nullableText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value));
const nullableId = z
  .string()
  .trim()
  .min(1, "شناسه نامعتبر است.")
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));
const nullableDateTime = z.iso.datetime({ offset: true }).nullable().optional();
const uniqueJobFunctionsSchema = z
  .array(jobFunctionSchema)
  .min(1, "حداقل یک سمت را انتخاب کنید.")
  .refine((values) => new Set(values).size === values.length, "سمت‌های تکراری مجاز نیستند.");
const submissionUrlSchema = z
  .string()
  .trim()
  .max(2048, "لینک تحویل بیش از حد طولانی است.")
  .refine((value) => {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "لینک تحویل باید با http یا https شروع شود.")
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "عنوان کار را وارد کنید.").max(200, "عنوان کار حداکثر ۲۰۰ نویسه است."),
  description: nullableText(4000, "توضیح کار حداکثر ۴۰۰۰ نویسه است."),
  dueAt: nullableDateTime,
  productId: nullableId,
  partId: nullableId,
  jobFunctions: uniqueJobFunctionsSchema,
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  expectedVersion: positiveVersionSchema,
});

export const submitAssignmentSchema = z.object({
  expectedVersion: positiveVersionSchema,
  submissionNote: nullableText(4000, "توضیح تحویل حداکثر ۴۰۰۰ نویسه است."),
  submissionUrl: submissionUrlSchema,
});

export const returnTaskSchema = z.object({
  expectedVersion: positiveVersionSchema,
  reason: z.string().trim().min(1, "دلیل برگشت را وارد کنید.").max(2000, "دلیل برگشت حداکثر ۲۰۰۰ نویسه است."),
  jobFunctions: uniqueJobFunctionsSchema,
});

export const versionActionSchema = z.object({ expectedVersion: positiveVersionSchema });

export const taskListQuerySchema = z
  .object({
    column: z.enum(TASK_COLUMNS),
    search: z.string().trim().max(200).optional(),
    jobFunction: jobFunctionSchema.optional(),
    due: z.enum(["overdue", "today", "week", "none"]).optional(),
    productId: z.string().trim().min(1).optional(),
    completedFrom: z.iso.datetime({ offset: true }).optional(),
    completedTo: z.iso.datetime({ offset: true }).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    ({ completedFrom, completedTo }) =>
      !completedFrom || !completedTo || new Date(completedFrom).getTime() <= new Date(completedTo).getTime(),
    { message: "بازه تکمیل نامعتبر است.", path: ["completedTo"] },
  );

export const taskHistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
