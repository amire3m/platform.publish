import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { db } from "@/db";
import { channelPalettes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { coverHtml, renderCoverHtmlToPng, resolvePalette } from "@/lib/covers/design-system";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  if (accountId) {
    const [row] = await db.select().from(channelPalettes).where(eq(channelPalettes.accountId, accountId)).limit(1);
    return jsonOk(row ?? { accountId, ...resolvePalette() });
  }
  const rows = await db.select().from(channelPalettes);
  return jsonOk({ palettes: rows });
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response!;
  let body: unknown; try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 400); }
  const b = body as Record<string, unknown>;
  const accountId = String(b.accountId ?? "");
  if (!accountId) return jsonError("accountId الزامی است.", 400);
  const palette = {
    accountId,
    paper: String(b.paper ?? "#FFF8F0"),
    ink: String(b.ink ?? "#1A1A1A"),
    primary: String(b.primary ?? "#E63946"),
    soft: String(b.soft ?? "#F1FAEE"),
    accent: String(b.accent ?? "#457B9D"),
    fontHeading: String(b.fontHeading ?? "Vazirmatn"),
    fontBody: String(b.fontBody ?? "Vazirmatn"),
    watermarkPath: b.watermarkPath ? String(b.watermarkPath) : null,
    updatedAt: new Date(),
  };
  await db.insert(channelPalettes).values(palette as never).onConflictDoUpdate({ target: channelPalettes.accountId, set: palette as never });
  // Optional immediate render test
  if (b.previewTitle) {
    const html = coverHtml(String(b.previewTitle), palette as never);
    const png = await renderCoverHtmlToPng(html, 1280, 720);
    return jsonOk({ ok: true, previewSize: png.length });
  }
  return jsonOk({ ok: true });
}
