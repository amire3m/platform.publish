import { requirePermission, jsonOk, jsonError } from "@/lib/api-helpers";
import { exportRecords, importRecords } from "@/lib/telegram/tgdb";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function GET() {
  const { user, response } = await requirePermission("export_data");
  if (!user) return response;
  const data = await exportRecords();
  return jsonOk(data);
}

export async function POST(req: Request) {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;
  try {
    const payload = await req.json();
    const imported = await importRecords(payload);
    await appendAuditEvent({
      actorTelegramId: user.telegramId,
      actorUserId: user.id,
      action: "import_records",
      entityType: "settings",
      after: { imported },
    });
    return jsonOk({ imported });
  } catch (err) {
    return jsonError(`وارد کردن داده ناموفق بود: ${(err as Error).message}`, 400);
  }
}
