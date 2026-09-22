import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { hasSuiteSession, loginViaBusinessSuite, removeSuiteSession, saveSuiteFromCookies, saveSuiteSession, verifySuiteSession, touchSuiteSession } from "@/lib/business/suite-session";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const [acc] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!acc) return jsonError("حساب یافت نشد.", 404);
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (action === "verify") { const r = await verifySuiteSession(id); return jsonOk(r); }
  if (action === "touch") { const r = await touchSuiteSession(id); return jsonOk(r); }
  const has = await hasSuiteSession(id);
  return jsonOk({ hasSession: has });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const [acc] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!acc) return jsonError("حساب یافت نشد.", 404);
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return jsonError("فایل storageState را آپلود کنید.", 400);
    const raw = await file.text();
    try { await saveSuiteSession(id, raw); } catch (err) { return jsonError((err as Error).message, 400); }
  } else {
    let body: unknown;
    try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 422); }
    const b = body as Record<string, unknown>;
    if (b.mode === "cookies") {
      try { await saveSuiteFromCookies(id, { c_user: String(b.c_user ?? b.cUser ?? ""), xs: String(b.xs ?? ""), fr: String(b.fr ?? "") }); } catch (err) { return jsonError((err as Error).message, 400); }
    } else if (b.mode === "credentials") {
      const email = String(b.email ?? b.username ?? "");
      const password = String(b.password ?? "");
      const code = b.code ? String(b.code) : undefined;
      if (!email || !password) return jsonError("ایمیل و رمز عبور الزامی است.", 400);
      try {
        const res = await loginViaBusinessSuite(id, email, password, code);
        if (!res.ok && res.needCode) return jsonError(res.detail, 422, "NEED_CODE");
        if (!res.ok) return jsonError(res.detail, 400);
      } catch (err) { return jsonError((err as Error).message.slice(0, 300), 400); }
    } else {
      const raw = String((b.storageState as string) ?? (b.raw as string) ?? "");
      if (!raw || raw.trim().length < 10) return jsonError("فایل سشن خالی است.", 400);
      try { await saveSuiteSession(id, raw); } catch (err) { return jsonError((err as Error).message, 400); }
    }
  }
  let verify: { ok: boolean; detail: string } | null = null;
  try { verify = await verifySuiteSession(id); } catch {}
  await db.update(socialAccounts).set({ capabilities: { ...(acc as unknown as { capabilities: Record<string, unknown> }).capabilities, businessSuite: true } } as never).where(eq(socialAccounts.id, id));
  await appendAuditEvent({ actorTelegramId: user.telegramId, actorUserId: user.id, action: "business_suite_uploaded", entityType: "social_account", entityId: id, before: null, after: { hasSession: true } as unknown as Record<string, unknown> });
  return jsonOk({ ok: true, hasSession: true, verify });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const [acc] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!acc) return jsonError("حساب یافت نشد.", 404);
  await removeSuiteSession(id);
  await db.update(socialAccounts).set({ capabilities: { ...(acc as unknown as { capabilities: Record<string, unknown> }).capabilities, businessSuite: false } } as never).where(eq(socialAccounts.id, id));
  await appendAuditEvent({ actorTelegramId: user.telegramId, actorUserId: user.id, action: "business_suite_removed", entityType: "social_account", entityId: id, before: null, after: null });
  return jsonOk({ ok: true, hasSession: false });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 422); }
  const action = (body as Record<string, unknown>).action as string;
  if (action === "touch") { const r = await touchSuiteSession(id); return jsonOk(r); }
  if (action === "verify") { const r = await verifySuiteSession(id); return jsonOk(r); }
  return jsonError("عملیات نامعتبر است.", 400);
}
