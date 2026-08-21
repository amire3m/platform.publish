// Manual/external trigger for the publish worker tick — useful when running
// behind a real cron system (e.g. a platform scheduled task) instead of (or
// in addition to) the in-process interval started in src/instrumentation.ts.
// Protected by a shared secret header so it cannot be abused publicly.
import { runPublishTick } from "@/lib/worker";
import { jsonError, jsonOk } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== secret) return jsonError("دسترسی غیرمجاز.", 401);
  }
  const result = await runPublishTick();
  return jsonOk(result);
}

export async function GET(req: Request) {
  return POST(req);
}
