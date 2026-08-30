import { PlaylistStreamer } from "./playlist-streamer";

type PublicSession = ReturnType<PlaylistStreamer["toPublic"]>;

export interface ControlRequestBody {
  action?: string;
  input?: string;
  videoId?: string;
  direction?: number;
  sceneName?: string;
}

/** Dispatch a queue-control action against the streamer. Returns public session or null on no-op. */
export async function dispatchControl(
  streamer: PlaylistStreamer,
  body: ControlRequestBody | null,
): Promise<{ ok: true; session: PublicSession } | { ok: false; error: string; status: number }> {
  const action = body?.action;
  switch (action) {
    case "skip":
      if (!streamer.skip()) return { ok: false, error: "جلسه لایو فعالی برای رد کردن وجود ندارد.", status: 409 };
      return { ok: true, session: streamer.toPublic() };
    case "stop":
      if (!streamer.stop("manual")) return { ok: false, error: "جلسه لایو فعالی برای توقف وجود ندارد.", status: 409 };
      return { ok: true, session: streamer.toPublic() };
    case "add": {
      const input = body?.input?.trim();
      if (!input) return { ok: false, error: "لینک یا شناسه ویدیو الزامی است.", status: 422 };
      try {
        await streamer.addItem(input);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "افزودن ویدیو ناموفق بود.", status: 400 };
      }
      return { ok: true, session: streamer.toPublic() };
    }
    case "remove": {
      if (!body?.videoId) return { ok: false, error: "شناسه ویدیو الزامی است.", status: 422 };
      if (!streamer.removeItem(body.videoId)) {
        return { ok: false, error: "حذف ممکن نیست؛ فقط آیتم‌های در صف حذف می‌شوند.", status: 409 };
      }
      return { ok: true, session: streamer.toPublic() };
    }
    case "move": {
      if (!body?.videoId || (body.direction !== -1 && body.direction !== 1)) {
        return { ok: false, error: "شناسه ویدیو و جهت (+۱ یا -۱) الزامی است.", status: 422 };
      }
      if (!streamer.moveItem(body.videoId, body.direction)) {
        return { ok: false, error: "جابه‌جایی ممکن نیست.", status: 409 };
      }
      return { ok: true, session: streamer.toPublic() };
    }
    case "replay": {
      if (!body?.videoId) return { ok: false, error: "شناسه ویدیو الزامی است.", status: 422 };
      if (!streamer.replayItem(body.videoId)) {
        return { ok: false, error: "پخش مجدد ممکن نیست.", status: 409 };
      }
      return { ok: true, session: streamer.toPublic() };
    }
    case "scene": {
      const name = body?.sceneName?.trim();
      if (!name) return { ok: false, error: "نام صحنه الزامی است.", status: 422 };
      const { loadLiveScene } = await import("./start");
      const { parseScenes } = await import("./scene");
      const scene = await loadLiveScene(name);
      if (!scene) return { ok: false, error: "صحنه پیدا نشد.", status: 404 };
      if (!streamer.applyScene(scene)) {
        return { ok: false, error: "جلسه فعالی برای تغییر صحنه وجود ندارد.", status: 409 };
      }
      return { ok: true, session: streamer.toPublic() };
    }
    default:
      return { ok: false, error: "اقدام نامعتبر است. skip/stop/add/remove/move/replay/scene بفرستید.", status: 400 };
  }
}
