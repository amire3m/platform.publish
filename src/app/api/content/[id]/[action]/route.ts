import { eq } from "drizzle-orm";
import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { updateContentRecord, appendAuditEvent, notifyUser } from "@/lib/telegram/tgdb";
import { publishContentNow } from "@/lib/worker";
import { formatJalaliDateTime, nowUtcIso } from "@/lib/date/jalali";
import { db as dbRef } from "@/db";
import { users } from "@/db/schema";

const PERMISSION_MAP: Record<string, string> = {
  "submit-review": "submit_for_review",
  approve: "approve_content",
  "request-changes": "approve_content",
  schedule: "schedule_content",
  "publish-now": "publish_now",
  cancel: "schedule_content",
  retry: "publish_now",
  archive: "edit_content",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const permission = PERMISSION_MAP[action];
  if (!permission) return jsonError("عملیات نامعتبر است.", 404);

  const { user, response } = await requirePermission(permission as Parameters<typeof requirePermission>[0]);
  if (!user) return response;

  const [existing] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  if (!existing) return jsonError("محتوا یافت نشد.", 404);

  const body = await req.json().catch(() => ({}));

  try {
    switch (action) {
      case "submit-review": {
        if (!["draft", "uploaded", "changes_requested"].includes(existing.status)) {
          return jsonError("این محتوا در وضعیتی نیست که بتوان آن را برای بررسی ارسال کرد.", 400);
        }
        const row = await updateContentRecord(id, { status: "in_review", approvalStatus: "pending" });
        await logAndNotifyApprovers(row, "محتوای جدید برای بررسی ارسال شد");
        return jsonOk(row);
      }
      case "approve": {
        const nextStatus = existing.scheduledAtUtc ? "scheduled" : "approved";
        const row = await updateContentRecord(id, {
          approvalStatus: "approved",
          approvedBy: user.id,
          approvedAt: new Date(),
          status: nextStatus,
        });
        await notifyCreator(row, "تأیید شد ✅");
        return jsonOk(row);
      }
      case "request-changes": {
        const row = await updateContentRecord(id, {
          approvalStatus: "changes_requested",
          status: "changes_requested",
          notes: body.reason ?? existing.notes,
        });
        await notifyCreator(row, `نیازمند اصلاح است ✏️: ${body.reason ?? "بدون توضیح"}`);
        return jsonOk(row);
      }
      case "schedule": {
        if (existing.approvalRequired && existing.approvalStatus !== "approved") {
          return jsonError("محتوا هنوز تأیید نشده است؛ ابتدا باید تأیید شود.", 400);
        }
        if (!body.scheduledAtUtc || !body.scheduledAtJalali) {
          return jsonError("زمان انتشار الزامی است.", 400);
        }
        const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) => ({
          ...t,
          status: "scheduled",
          publish_at_utc: body.scheduledAtUtc,
          publish_at_jalali: body.scheduledAtJalali,
        }));
        const row = await updateContentRecord(id, {
          status: "scheduled",
          scheduledAtUtc: new Date(body.scheduledAtUtc),
          scheduledAtJalali: body.scheduledAtJalali,
          platformTargets: targets,
        });
        return jsonOk(row);
      }
      case "publish-now": {
        const row = await publishContentNow(id);
        return jsonOk(row);
      }
      case "cancel": {
        if (existing.status !== "scheduled") return jsonError("فقط محتوای زمان‌بندی‌شده قابل لغو زمان‌بندی است.", 400);
        const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) =>
          t.status === "scheduled" ? { ...t, status: "approved" } : t,
        );
        const row = await updateContentRecord(id, {
          status: "approved",
          scheduledAtUtc: null,
          scheduledAtJalali: null,
          platformTargets: targets,
        });
        return jsonOk(row);
      }
      case "retry": {
        if (!["failed", "publishing"].includes(existing.status)) {
          return jsonError("فقط محتوای ناموفق قابل تلاش مجدد است.", 400);
        }
        const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) =>
          t.status === "failed"
            ? { ...t, status: "scheduled", attempts: 0, nextRetryAt: null, publish_at_utc: nowUtcIso() }
            : t,
        );
        const row = await updateContentRecord(id, {
          status: "scheduled",
          scheduledAtUtc: new Date(),
          platformTargets: targets,
          error: null,
        });
        return jsonOk(row);
      }
      case "archive": {
        const row = await updateContentRecord(id, { status: "archived", archivedAt: new Date() });
        return jsonOk(row);
      }
      default:
        return jsonError("عملیات نامعتبر است.", 404);
    }
  } catch (err) {
    return jsonInternalError(err, "api/content/[id]/[action]");
  } finally {
    await appendAuditEvent({
      actorTelegramId: user.telegramId,
      actorUserId: user.id,
      action: `content_${action.replace(/-/g, "_")}`,
      entityType: "content",
      entityId: id,
      before: { status: existing.status },
    });
  }
}

async function notifyCreator(row: typeof content.$inferSelect | undefined, statusText: string) {
  if (!row?.createdBy) return;
  const [creator] = await dbRef.select().from(users).where(eq(users.id, row.createdBy)).limit(1);
  if (!creator) return;
  const when = row.scheduledAtUtc ? formatJalaliDateTime(row.scheduledAtUtc) : formatJalaliDateTime(nowUtcIso());
  await notifyUser(creator.telegramId, `محتوای «${row.title || row.id}» ${statusText}\nزمان: ${when}`);
}

async function logAndNotifyApprovers(row: typeof content.$inferSelect | undefined, text: string) {
  if (!row) return;
  const approvers = await dbRef.select().from(users).where(eq(users.role, "manager"));
  const owners = await dbRef.select().from(users).where(eq(users.role, "owner"));
  for (const u of [...approvers, ...owners]) {
    await notifyUser(u.telegramId, `${text}: «${row.title || row.id}»`);
  }
}
