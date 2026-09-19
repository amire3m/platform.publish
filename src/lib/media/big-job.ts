/**
 * Global in-process mutex for heavyweight media operations (multi-hundred-MB
 * downloads, ffmpeg runs, provider uploads). The box has 2GB RAM shared by
 * the whole Next.js process, so only ONE big job may hold large resources at
 * a time; everything else queues behind it instead of OOM-killing the server.
 */
let tail: Promise<unknown> = Promise.resolve();

export async function runBigJob<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const prev = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev.catch(() => {});
  console.log(`[bigjob] start ${label}`);
  const started = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[bigjob] done ${label} in ${Math.round((Date.now() - started) / 1000)}s`);
    release();
  }
}
