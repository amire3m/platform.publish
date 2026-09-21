import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { hasBrowserSession, removeBrowserSession, saveBrowserSession, verifyBrowserSession } from "@/lib/instagram/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const [acc] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!acc) return jsonError("حساب یافت نشد.", 404);
  if ((acc as unknown as { platform: string }).platform !== "instagram") {
    return jsonError("این حساب اینستاگرام نیست.", 400);
  }
  const has = await hasBrowserSession(id);
  return jsonOk({ hasSession: has });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const [acc] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!acc) return jsonError("حساب یافت نشد.", 404);
  if ((acc as unknown as { platform: string }).platform !== "instagram") {
    return jsonError("این حساب اینستاگرام نیست.", 400);
  }

  const ct = req.headers.get("content-type") ?? "";
  let raw = "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return jsonError("فایل storageState.json را آپلود کنید.", 400);
    raw = await file.text();
  } else {
    try {
      const body = (await req.json()) as { storageState?: string; raw?: string };
      raw = body.storageState ?? body.raw ?? "";
    } catch {
      return jsonError("درخواست نامعتبر است.", 422);
    }
  }
  if (!raw || raw.trim().length < 10) return jsonError("فایل سشن خالی است.", 400);

  try {
    await saveBrowserSession(id, raw);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  // Verify live (best-effort, never blocks saving).
  let verify: { ok: boolean; detail: string } | null = null;
  try { verify = await verifyBrowserSession(id); } catch {}

  await db.update(socialAccounts).set({ capabilities: { ...(acc as unknown as { capabilities: Record<string, unknown> }).capabilities, browserSession: true }, updatedAt: new Date() } as never).where(eq(socialAccounts.id, id));
  await appendAuditEvent({ actorTelegramId: user.telegramId, actorUserId: user.id, action: "instagram_session_uploaded", entityType: "social_account", entityId: id, before: null, after: { hasSession: true } as unknown as Record<string, unknown> });

  return jsonOk({ ok: true, hasSession: true, verify });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const [acc] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!acc) return jsonError("حساب یافت نشد.", 404);
  await removeBrowserSession(id);
  await db.update(socialAccounts).set({ capabilities: { ...(acc as unknown as { capabilities: Record<string, unknown> }).capabilities, browserSession: false }, updatedAt: new Date() } as never).where(eq(socialAccounts.id, id));
  await appendAuditEvent({ actorTelegramId: user.telegramId, actorUserId: user.id, action: "instagram_session_removed", entityType: "social_account", entityId: id, before: null, after: null });
  return jsonOk({ ok: true, hasSession: false });
}
