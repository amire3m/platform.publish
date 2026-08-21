// Mock provider used when no real OAuth credential is connected for an
// account, or when TELEGRAM/PLATFORM sandbox mode is requested explicitly.
// It NEVER claims a fake "published" state silently — every mock result is
// tagged `raw.mock = true` so the UI can render a clear "حالت آزمایشی" badge,
// per the "never fake success" rule in the product spec.
import type { PublishInput, PublishResult } from "./types";

export async function mockPublish(platform: "youtube" | "instagram", input: PublishInput): Promise<PublishResult> {
  // Simulate basic validation so obviously broken uploads still fail in mock mode.
  if (input.fileBuffer.length === 0) {
    return { ok: false, errorCode: "EMPTY_FILE", message: "فایل خالی است.", retryable: false };
  }
  const fakeId = `mock_${platform}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const permalink =
    platform === "youtube"
      ? `https://youtube.com/watch?v=${fakeId}`
      : `https://instagram.com/p/${fakeId}`;
  return {
    ok: true,
    externalId: fakeId,
    permalink,
    raw: { mock: true, note: "این نتیجه در حالت آزمایشی تولید شده و انتشار واقعی رخ نداده است." },
  };
}
