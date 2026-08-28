import { eq } from "drizzle-orm";
import { db } from "@/db";
import { content, users } from "@/db/schema";
import { hasPermission, type Permission } from "@/lib/permissions";
import { updateContentRecord, appendAuditEvent } from "@/lib/telegram/tgdb";
import { publishContentNow } from "@/lib/worker";
import { nowUtcIso } from "@/lib/date/jalali";

const PERMISSION_MAP: Record<string, string> = {
  approve: "approve_content",
  "request-changes": "approve_content",
  schedule: "schedule_content",
  cancel: "schedule_content",
  "publish-now": "publish_now",
  retry: "publish_now",
  archive: "edit_content",
};

export async function routeCallback(
  action: string,
  contentId: string,
  fromTelegramId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!action || !contentId || !fromTelegramId) {
    return { ok: false, message: "درخواست نامعتبر است." };
  }

  // 1) users.telegramId lookup
  let user: typeof users.$inferSelect | null = null;
  try {
    const [found] = await db.select().from(users).where(eq(users.telegramId, fromTelegramId)).limit(1);
    user = found ?? null;
  } catch {
    return { ok: false, message: "خطای پایگاه داده." };
  }
  if (!user) {
    return { ok: false, message: "کاربر یافت نشد یا دسترسی ندارد." };
  }
  if (!user.active) {
    return { ok: false, message: "حساب کاربری غیرفعال است." };
  }

  // 2) hasPermission
  const permissionRaw = PERMISSION_MAP[action];
  if (!permissionRaw) {
    return { ok: false, message: "عملیات نامعتبر است." };
  }
  const permission = permissionRaw as Permission;
  const subject = {
    role: user.role,
    allowedActions: user.allowedActions,
    allowedAccountIds: user.allowedAccountIds,
  };
  if (!hasPermission(subject, permission)) {
    return { ok: false, message: "شما مجوز انجام این عملیات را ندارید." };
  }

  // 3) content lookup
  let existing: typeof content.$inferSelect | null = null;
  try {
    const [row] = await db.select().from(content).where(eq(content.id, contentId)).limit(1);
    existing = row ?? null;
  } catch {
    return { ok: false, message: "خطای پایگاه داده." };
  }
  if (!existing) {
    return { ok: false, message: "محتوا یافت نشد." };
  }

  // 4) dispatch to same handlers as src/app/api/content/[id]/[action]/route.ts
  try {
    switch (action) {
      case "approve": {
        const nextStatus = existing.scheduledAtUtc ? "scheduled" : "approved";
        await updateContentRecord(contentId, {
          approvalStatus: "approved",
          approvedBy: user.id,
          approvedAt: new Date(),
          status: nextStatus,
        });
        try {
          await appendAuditEvent({
            actorTelegramId: user.telegramId,
            actorUserId: user.id,
            action: "content_approve",
            entityType: "content",
            entityId: contentId,
            before: { status: existing.status },
            after: { status: nextStatus },
          });
        } catch {}
        return { ok: true, message: "تأیید شد ✅" };
      }
      case "request-changes": {
        await updateContentRecord(contentId, {
          approvalStatus: "changes_requested",
          status: "changes_requested",
        });
        try {
          await appendAuditEvent({
            actorTelegramId: user.telegramId,
            actorUserId: user.id,
            action: "content_request_changes",
            entityType: "content",
            entityId: contentId,
            before: { status: existing.status },
            after: { status: "changes_requested" },
          });
        } catch {}
        return { ok: true, message: "درخواست اصلاح ثبت شد ✏️" };
      }
      case "schedule": {
        if (existing.approvalRequired && existing.approvalStatus !== "approved") {
          return { ok: false, message: "محتوا هنوز تأیید نشده است؛ ابتدا باید تأیید شود." };
        }
        // callback has no body with scheduledAt; require explicit scheduling via panel
        return { ok: false, message: "زمان انتشار از طریق پنل تنظیم شود." };
      }
      case "cancel": {
        if (existing.status !== "scheduled") {
          return { ok: false, message: "فقط محتوای زمان‌بندی‌شده قابل لغو است." };
        }
        const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) =>
          t.status === "scheduled" ? { ...t, status: "approved" } : t,
        );
        await updateContentRecord(contentId, {
          status: "approved",
          scheduledAtUtc: null,
          scheduledAtJalali: null,
          platformTargets: targets,
        });
        try {
          await appendAuditEvent({
            actorTelegramId: user.telegramId,
            actorUserId: user.id,
            action: "content_cancel",
            entityType: "content",
            entityId: contentId,
            before: { status: existing.status },
            after: { status: "approved" },
          });
        } catch {}
        return { ok: true, message: "زمان‌بندی لغو شد ⏸" };
      }
      case "publish-now": {
        await publishContentNow(contentId);
        try {
          await appendAuditEvent({
            actorTelegramId: user.telegramId,
            actorUserId: user.id,
            action: "content_publish_now",
            entityType: "content",
            entityId: contentId,
            before: { status: existing.status },
          });
        } catch {}
        return { ok: true, message: "انتشار آغاز شد 🚀" };
      }
      case "retry": {
        if (!["failed", "publishing"].includes(existing.status)) {
          return { ok: false, message: "فقط محتوای ناموفق قابل تلاش مجدد است." };
        }
        const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) =>
          t.status === "failed"
            ? { ...t, status: "scheduled", attempts: 0, nextRetryAt: null, publish_at_utc: nowUtcIso() }
            : t,
        );
        await updateContentRecord(contentId, {
          status: "scheduled",
          scheduledAtUtc: new Date(),
          platformTargets: targets,
          error: null,
        });
        try {
          await appendAuditEvent({
            actorTelegramId: user.telegramId,
            actorUserId: user.id,
            action: "content_retry",
            entityType: "content",
            entityId: contentId,
            before: { status: existing.status },
            after: { status: "scheduled" },
          });
        } catch {}
        return { ok: true, message: "تلاش مجدد زمان‌بندی شد 🔄" };
      }
      case "archive": {
        await updateContentRecord(contentId, { status: "archived", archivedAt: new Date() });
        try {
          await appendAuditEvent({
            actorTelegramId: user.telegramId,
            actorUserId: user.id,
            action: "content_archive",
            entityType: "content",
            entityId: contentId,
            before: { status: existing.status },
            after: { status: "archived" },
          });
        } catch {}
        return { ok: true, message: "آرشیو شد 🗄️" };
      }
      default:
        return { ok: false, message: "عملیات نامعتبر است." };
    }
  } catch (err) {
    console.error("[callback-router] handler failed:", (err as Error).message);
    return { ok: false, message: "خطای داخلی سرور." };
  }
}
