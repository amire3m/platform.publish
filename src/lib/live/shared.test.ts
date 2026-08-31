import { describe, expect, it } from "vitest";
import { buildChannelCreate, normalizeCookieContent, publicChannel, validateScheduleInput } from "./shared";

describe("cookie normalization", () => {
  it("accepts JSON cookie exports and converts to Netscape", () => {
    const json = JSON.stringify([
      { domain: ".youtube.com", name: "SID", value: "abc", path: "/", secure: false, session: false, expirationDate: 1822649549.9 },
      { domain: ".youtube.com", name: "SSID", value: "xyz", path: "/", secure: true, session: false, expirationDate: 1819740321 },
      { domain: ".youtube.com", name: "wide", value: "0", path: "/", secure: false, session: true },
    ]);
    const out = normalizeCookieContent(json);
    expect(out).toContain("# Netscape HTTP Cookie File");
    expect(out).toContain(".youtube.com\tTRUE\t/\tFALSE\t1822649549\tSID\tabc");
    expect(out).toContain(".youtube.com\tTRUE\t/\tTRUE\t1819740321\tSSID\txyz");
    expect(out).toContain(".youtube.com\tTRUE\t/\tFALSE\t0\twide\t0");
  });

  it("passes through valid Netscape content", () => {
    const netscape = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t123\tFOO\tbar";
    expect(normalizeCookieContent(netscape)).toBe(netscape);
  });

  it("rejects junk", () => {
    expect(normalizeCookieContent("")).toBeNull();
    expect(normalizeCookieContent("random junk")).toBeNull();
    expect(normalizeCookieContent("[]")).toBeNull();
    expect(normalizeCookieContent('[{"name":"no-domain"}]')).toBeNull();
  });
});

describe("live shared helpers", () => {
  it("builds channel create payload and rejects empty name/rtmp", () => {
    const ok = buildChannelCreate({ name: "Main", rtmpUrl: "rtmp://a/live2", streamKey: "key-1" });
    expect(ok).toEqual({ name: "Main", provider: "youtube", rtmpUrl: "rtmp://a/live2", streamKey: "key-1" });
    expect(buildChannelCreate({ name: "  ", rtmpUrl: "rtmp://a", streamKey: "k" })).toBeNull();
    expect(buildChannelCreate({ name: "x", rtmpUrl: "", streamKey: "k" })).toBeNull();
    expect(buildChannelCreate({ name: "x", rtmpUrl: "rtmp://a", streamKey: "" })).toBeNull();
    expect(buildChannelCreate({ name: "x", rtmpUrl: "rtmp://a", streamKey: "k", provider: "custom" })?.provider).toBe("custom");
  });

  it("masks stream key in public channel shape", () => {
    const pub = publicChannel({
      id: "LCH-1",
      name: "Main",
      provider: "youtube",
      rtmpUrl: "rtmp://a/live2",
      isActive: true,
    });
    expect(pub).toEqual({ id: "LCH-1", name: "Main", provider: "youtube", rtmpUrl: "rtmp://a/live2", isActive: true });
  });

  it("validates schedule inputs", () => {
    const base = { name: "S", channelRef: "LCH-1", playlistInput: "PL123", startTehran: "18:00", endTehran: "22:00", daysOfWeek: [0, 6] };
    expect(validateScheduleInput(base)).toEqual({ ok: true, value: expect.objectContaining({ name: "S", quality: "720", loop: true }) });
    expect(validateScheduleInput({ ...base, startTehran: "24:00" }).ok).toBe(false);
    expect(validateScheduleInput({ ...base, endTehran: "7:5" }).ok).toBe(false);
    expect(validateScheduleInput({ ...base, daysOfWeek: [7] }).ok).toBe(false);
    expect(validateScheduleInput({ ...base, daysOfWeek: [] }).ok).toBe(false);
    expect(validateScheduleInput({ ...base, quality: "480" }).ok).toBe(false);
    expect(validateScheduleInput({ ...base, name: "" }).ok).toBe(false);
    // end before start is allowed (midnight span)
    expect(validateScheduleInput({ ...base, startTehran: "22:00", endTehran: "02:00" }).ok).toBe(true);
    expect(validateScheduleInput({ ...base, endTehran: null }).ok).toBe(true);
  });
});
