// Manual/external trigger for the publish worker tick — useful when running
// behind a real cron system (e.g. a platform scheduled task) instead of (or
// in addition to) the in-process interval started in src/instrumentation.ts.
// Protected by a shared secret header so it cannot be abused publicly.
import { runPublishTick } from "@/lib/worker";
import { runScheduledAnalyticsSync } from "@/lib/analytics/scheduler";
import { jsonError, jsonOk } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError("Cron is not configured.", 503);
  const provided = req.headers.get("x-cron-secret");
  if (provided !== secret) return jsonError("دسترسی غیرمجاز.", 401);
  const [publishResult, analyticsResult] = await Promise.allSettled([
    runPublishTick(),
    runScheduledAnalyticsSync(),
  ]);
  const publish = publishResult.status === "fulfilled"
    ? { ok: true as const, value: publishResult.value }
    : { ok: false as const, error: "Publish job failed." };
  const analytics = analyticsResult.status === "fulfilled"
    ? { ok: true as const, value: analyticsResult.value }
    : { ok: false as const, error: "Analytics job failed." };
  return jsonOk({ publish, analytics });
}

export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
