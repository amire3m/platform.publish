// Next.js instrumentation hook — runs once when the server process starts.
// We use it to start the in-process publish worker interval (see
// src/lib/worker.ts for the architectural note on why this is in-process
// rather than a separate container in this deployment).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_PUBLISH_WORKER === "1") return;

  const { runPublishTick } = await import("@/lib/worker");
  const intervalMs = Number(process.env.WORKER_TICK_INTERVAL_MS || 60_000);

  setInterval(() => {
    runPublishTick().catch((err) => {
      console.error("[worker] tick failed:", (err as Error).message);
    });
  }, intervalMs);

  console.log(`[worker] YouTube EmRo publish worker started (interval: ${intervalMs}ms)`);
}
