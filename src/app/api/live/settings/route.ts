import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";

export const runtime = "nodejs";

interface LiveSettings {
  logoPath?: string;
  position?: string;
  opacity?: number;
}

function readLive(row: { capabilityConfig: unknown } | undefined): LiveSettings {
  const cfg = (row?.capabilityConfig as Record<string, unknown> | undefined)?.live as LiveSettings | undefined;
  return { logoPath: cfg?.logoPath ?? "", position: cfg?.position ?? "top-right", opacity: cfg?.opacity ?? 0.8 };
}

export async function GET() {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    return jsonOk(readLive(row));
  } catch (err) {
    return jsonInternalError(err, "live/settings GET");
  }
}

export async function PATCH(req: Request) {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const body = (await req.json().catch(() => null)) as LiveSettings | null;
    if (!body) return jsonError("درخواست نامعتبر است.", 400, "VALIDATION_ERROR");
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
    if (body.position !== undefined && !positions.includes(body.position)) {
      return jsonError("موقعیت لوگو نامعتبر است.", 422, "VALIDATION_ERROR");
    }
    if (body.opacity !== undefined && (typeof body.opacity !== "number" || body.opacity < 0 || body.opacity > 1)) {
      return jsonError("شفافیت باید بین ۰ و ۱ باشد.", 422, "VALIDATION_ERROR");
    }
    const [current] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    const merged: LiveSettings = { ...readLive(current), ...body };
    const capabilityConfig = { ...((current?.capabilityConfig as Record<string, unknown>) ?? {}), live: merged };
    await db
      .insert(appSettings)
      .values({ id: 1, capabilityConfig, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.id, set: { capabilityConfig, updatedAt: new Date() } });
    return jsonOk(merged);
  } catch (err) {
    return jsonInternalError(err, "live/settings PATCH");
  }
}
