import { describe, expect, it } from "vitest";
import { buildChannelCreate, publicChannel, validateScheduleInput } from "./shared";

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
