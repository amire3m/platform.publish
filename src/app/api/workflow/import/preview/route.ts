import { z } from "zod";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { parsePublicSheetUrl, fetchSheetCsv } from "@/lib/workflow/import/sheet-fetch";
import { previewWorkflowImport } from "@/lib/workflow/import/import-service";

export const previewRequestSchema = z.object({
  sheetUrl: z.string().trim().min(1, "آدرس شیت الزامی است.").optional(),
  csv: z.string().optional(),
  sheetId: z.string().optional(),
  gid: z.string().optional(),
  mapping: z.record(z.string(), z.unknown()).optional(),
  decisions: z.record(z.string(), z.unknown()).optional(),
}).refine((data) => data.sheetUrl || data.csv || (data.sheetId), {
  message: "آدرس شیت یا داده CSV الزامی است.",
});

export interface PreviewRouteDependencies {
  requirePermission: typeof requirePermission;
  fetchSheetCsv: typeof fetchSheetCsv;
  parsePublicSheetUrl: typeof parsePublicSheetUrl;
  previewWorkflowImport: typeof previewWorkflowImport;
}

const defaultDeps: PreviewRouteDependencies = {
  requirePermission,
  fetchSheetCsv,
  parsePublicSheetUrl,
  previewWorkflowImport,
};

export async function handlePreviewRequest(
  request: Request,
  deps: PreviewRouteDependencies = defaultDeps,
): Promise<Response> {
  const { user, response } = await deps.requirePermission("import_workflow");
  if (!user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const parsed = previewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
  }

  const { sheetUrl, csv, mapping, decisions } = parsed.data as {
    sheetUrl?: string;
    csv?: string;
    mapping?: Record<string, unknown>;
    decisions?: Record<string, unknown>;
  };

  try {
    let csvText = csv ?? "";
    let sheetId: string | undefined;
    let sheetGid: string | undefined;

    if (sheetUrl) {
      let ref: { sheetId: string; gid: string };
      try {
        ref = deps.parsePublicSheetUrl(sheetUrl);
      } catch {
        return jsonError("آدرس صفحه‌گسترده Google معتبر نیست.", 422, "VALIDATION_ERROR");
      }
      sheetId = ref.sheetId;
      sheetGid = ref.gid;
      try {
        csvText = await deps.fetchSheetCsv(ref);
      } catch (e) {
        const msg = (e as Error).message ?? "خطا در دریافت شیت";
        // Do not leak URL
        if (msg.includes("redirect") || msg.includes("مسیر انتقال")) return jsonError("مسیر انتقال صفحه‌گسترده Google مجاز نیست.", 422, "VALIDATION_ERROR");
        if (msg.includes("حجم")) return jsonError(msg, 422, "VALIDATION_ERROR");
        return jsonError("دریافت صفحه‌گسترده Google ناموفق بود. از عمومی‌بودن صفحه‌گسترده مطمئن شوید و دوباره تلاش کنید.", 502, "FETCH_FAILED");
      }
    }

    if (!csvText) {
      return jsonError("داده CSV یافت نشد.", 422, "VALIDATION_ERROR");
    }

    const actorUserId = (user as unknown as { id?: string }).id ?? "unknown";
    const result = await deps.previewWorkflowImport({
      csv: csvText,
      mapping: mapping ?? null,
      actorUserId,
      sheetId,
      sheetGid: sheetGid ?? null,
      decisions: decisions as Record<string, unknown>,
    });

    // Return safe per-row warnings (no secrets)
    return jsonOk({
      previewId: result.id,
      token: result.token,
      csvHash: result.csvHash,
      mapping: result.mapping,
      mappingDetails: result.mappingDetails,
      duplicates: result.duplicates,
      unknowns: result.unknowns,
      rows: result.rows,
      sheetId,
      sheetGid,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "VALIDATION_ERROR") return jsonError((e as Error).message, 422, code);
    console.error("[workflow-import-preview] failed:", e);
    return jsonError("خطای داخلی سرور رخ داد. دوباره تلاش کنید.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request): Promise<Response> {
  return handlePreviewRequest(request, defaultDeps);
}
