import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { hasBrowserSession, loginWithCredentials, removeBrowserSession, saveBrowserSession, saveBrowserSessionFromCookies, verifyBrowserSession } from "@/lib/instagram/session";

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
  // Multipart = file upload (storageState)
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return jsonError("فایل storageState.json را آپلود کنید.", 400);
    const raw = await file.text();
    try { await saveBrowserSession(id, raw); } catch (err) { return jsonError((err as Error).message, 400); }
  } else {
    let body: unknown;
    try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 422); }
    const b = body as Record<string, unknown>;

    // Mode: cookies paste
    if (b.mode === "cookies") {
      try {
        await saveBrowserSessionFromCookies(id, {
          sessionid: String(b.sessionid ?? ""),
          csrftoken: String(b.csrftoken ?? ""),
          ds_user_id: String(b.ds_user_id ?? b.dsUserId ?? ""),
          mid: String(b.mid ?? ""),
          rur: String(b.rur ?? ""),
        });
      } catch (err) { return jsonError((err as Error).message, 400); }
    } else if (b.mode === "credentials") {
      // Username/password (+ optional 2FA code) -> Playwright login
      const username = String(b.username ?? "").trim();
      const password = String(b.password ?? "");
      const code = b.code != null ? String(b.code) : undefined;
      if (!username || !password) return jsonError("نام کاربری و رمز عبور الزامی است.", 400);
      try {
        const res = await loginWithCredentials(id, username, password, code);
        if (!res.ok && res.needCode) {
          return jsonError(res.detail, 422, "NEED_CODE");
        }
        if (!res.ok) return jsonError(res.detail, 400);
      } catch (err) {
        return jsonError((err as Error).message.slice(0, 300), 400);
      }
    } else {
      // Default: storageState JSON
      const raw = String((b.storageState as string) ?? (b.raw as string) ?? "");
      if (!raw || raw.trim().length < 10) return jsonError("فایل سشن خالی است.", 400);
      try { await saveBrowserSession(id, raw); } catch (err) { return jsonError((err as Error).message, 400); }
    }
  }

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
