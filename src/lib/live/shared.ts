// Shared validation/serialization helpers for live conductor APIs.
// Pure functions — no DB/network access — so they are unit-testable.

export interface ChannelCreateInput {
  name: string;
  provider?: string;
  rtmpUrl: string;
  streamKey: string;
}

export interface ChannelCreate {
  name: string;
  provider: "youtube" | "custom";
  rtmpUrl: string;
  streamKey: string;
}

export function buildChannelCreate(body: ChannelCreateInput | null | undefined): ChannelCreate | null {
  const name = body?.name?.trim() ?? "";
  const rtmpUrl = body?.rtmpUrl?.trim() ?? "";
  const streamKey = body?.streamKey?.trim() ?? "";
  if (!name || !rtmpUrl || !streamKey) return null;
  const provider = body?.provider === "custom" ? "custom" : "youtube";
  return { name, provider, rtmpUrl, streamKey };
}

export interface PublicChannel {
  id: string;
  name: string;
  provider: string;
  rtmpUrl: string;
  isActive: boolean;
}

/** Strip the encrypted key — write-only secret, never leaves the server. */
export function publicChannel(row: {
  id: string;
  name: string;
  provider: string;
  rtmpUrl: string;
  isActive: boolean;
}): PublicChannel {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    rtmpUrl: row.rtmpUrl,
    isActive: row.isActive,
  };
}

/**
 * Accept both Netscape cookies.txt content and a JSON cookie export
 * (Cookie-Editor / EditThisCookie style: [{domain,name,value,path,secure,...}]).
 * Returns the canonical Netscape text, or null when unrecognizable.
 */
export function normalizeCookieContent(content: string): string | null {
  const s = content.trim();
  if (!s) return null;
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as Array<{
        domain?: string; name?: string; value?: string; path?: string;
        secure?: boolean; session?: boolean; expirationDate?: number;
      }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const lines = ["# Netscape HTTP Cookie File"];
      for (const c of arr) {
        if (!c.domain || !c.name || c.value === undefined) return null;
        const flag = c.domain.startsWith(".") ? "TRUE" : "FALSE";
        const secure = c.secure ? "TRUE" : "FALSE";
        const exp = c.session ? "0" : String(Math.floor(Number(c.expirationDate ?? 0)) || 0);
        lines.push([c.domain, flag, c.path ?? "/", secure, exp, c.name, c.value].join("\t"));
      }
      return lines.join("\n");
    } catch {
      return null;
    }
  }
  // Netscape: header or tab-separated data lines
  const dataLines = s.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (dataLines.length > 0 && dataLines.every((l) => l.split("\t").length >= 6)) {
    return s;
  }
  return null;
}

export interface ScheduleInput {
  name: string;
  channelRef: string;
  playlistInput: string;
  quality?: string;
  loop?: boolean;
  overlayEnabled?: boolean;
  startTehran: string;
  endTehran?: string | null;
  daysOfWeek: number[];
  enabled?: boolean;
}

export interface ScheduleValue {
  name: string;
  channelRef: string;
  playlistInput: string;
  quality: "720" | "1080";
  loop: boolean;
  overlayEnabled: boolean;
  startTehran: string;
  endTehran: string | null;
  daysOfWeek: number[];
  enabled: boolean;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateScheduleInput(
  body: ScheduleInput | null | undefined,
): { ok: true; value: ScheduleValue } | { ok: false; error: string } {
  if (!body) return { ok: false, error: "بدنه درخواست نامعتبر است." };
  const name = body.name?.trim() ?? "";
  const channelRef = body.channelRef?.trim() ?? "";
  const playlistInput = body.playlistInput?.trim() ?? "";
  const startTehran = body.startTehran?.trim() ?? "";
  const endRaw = body.endTehran?.trim() ?? "";
  const days = body.daysOfWeek;
  if (!name) return { ok: false, error: "نام برنامه الزامی است." };
  if (!channelRef) return { ok: false, error: "کانال الزامی است." };
  if (!playlistInput) return { ok: false, error: "پلی‌لیست الزامی است." };
  if (!HHMM.test(startTehran)) return { ok: false, error: "ساعت شروع باید HH:MM باشد." };
  if (endRaw && !HHMM.test(endRaw)) return { ok: false, error: "ساعت پایان باید HH:MM باشد." };
  if (!Array.isArray(days) || days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { ok: false, error: "روزهای هفته باید آرایه‌ای از اعداد ۰ تا ۶ باشد." };
  }
  const quality = body.quality === "1080" ? "1080" : body.quality === "720" ? "720" : null;
  if (body.quality !== undefined && !quality) return { ok: false, error: "کیفیت باید 720 یا 1080 باشد." };
  return {
    ok: true,
    value: {
      name,
      channelRef,
      playlistInput,
      quality: (quality ?? "720") as "720" | "1080",
      loop: body.loop ?? true,
      overlayEnabled: body.overlayEnabled ?? false,
      startTehran,
      endTehran: endRaw || null,
      daysOfWeek: [...days],
      enabled: body.enabled ?? true,
    },
  };
}
