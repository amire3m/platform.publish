import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import {
  isWithinWindow,
  pastEnd,
  dueSchedules,
  runLiveConductorTick,
  type ConductorSchedule,
  type LiveConductorDeps,
} from "./conductor";

function tehran(h: number, m: number, weekday: number): DateTime {
  // Build a DateTime in Tehran zone whose weekday matches JS convention (0=Sun).
  // luxon weekday: 1=Mon..7=Sun → JS Sunday(0) ↔ luxon 7.
  const luxonWeekday = weekday === 0 ? 7 : weekday;
  const base = DateTime.fromObject({ hour: h, minute: m }, { zone: "Asia/Tehran" });
  const shift = (luxonWeekday - base.weekday + 7) % 7;
  return base.plus({ days: shift });
}

function sched(partial: Partial<ConductorSchedule>): ConductorSchedule {
  return {
    id: "LSC-1",
    name: "Evening",
    channelRef: "LCH-1",
    playlistInput: "PLx",
    quality: "720",
    loop: true,
    overlayEnabled: false,
    startTehran: "18:00",
    endTehran: "22:00",
    daysOfWeek: [3], // Wednesday
    enabled: true,
    lastStartedAt: null,
    ...partial,
  };
}

function makeDeps(): { deps: LiveConductorDeps; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { started: [], stopped: [], notify: [], marked: [] };
  const deps: LiveConductorDeps = {
    now: () => tehran(18, 30, 3),
    isActiveSession: () => false,
    activeSession: () => null,
    listSchedules: async () => [],
    startSession: async (s) => {
      calls.started.push(s.id);
    },
    stopSession: (reason) => {
      calls.stopped.push(reason);
      return true;
    },
    markScheduleStarted: async (id) => {
      calls.marked.push(id);
    },
    markScheduleError: async () => {},
    notify: async (action, detail) => {
      calls.notify.push({ action, detail });
    },
  };
  return { deps, calls };
}

describe("conductor window math", () => {
  it("isWithinWindow handles same-day and midnight-spanning windows", () => {
    expect(isWithinWindow(18 * 60 + 30, "18:00", "22:00")).toBe(true);
    expect(isWithinWindow(17 * 60 + 59, "18:00", "22:00")).toBe(false);
    expect(isWithinWindow(22 * 60, "18:00", "22:00")).toBe(false); // end exclusive
    // 22:00→02:00 spans midnight
    expect(isWithinWindow(23 * 60, "22:00", "02:00")).toBe(true);
    expect(isWithinWindow(1 * 60 + 30, "22:00", "02:00")).toBe(true);
    expect(isWithinWindow(3 * 60, "22:00", "02:00")).toBe(false);
    // null end = open-ended after start
    expect(isWithinWindow(23 * 60, "18:00", null)).toBe(true);
    expect(isWithinWindow(17 * 60, "18:00", null)).toBe(false);
  });

  it("pastEnd detects end for same-day and midnight-spanning windows", () => {
    expect(pastEnd(22 * 60 + 1, "18:00", "22:00")).toBe(true);
    expect(pastEnd(21 * 60 + 59, "18:00", "22:00")).toBe(false);
    // midnight span: past end between 02:00 and 22:00
    expect(pastEnd(3 * 60, "22:00", "02:00")).toBe(true);
    expect(pastEnd(1 * 60, "22:00", "02:00")).toBe(false);
    expect(pastEnd(23 * 60, "22:00", "02:00")).toBe(false);
  });
});

describe("dueSchedules", () => {
  it("matches day and window and skips already-started-today", () => {
    const s = sched({});
    const wed = tehran(18, 30, 3);
    expect(dueSchedules([s], wed)).toEqual([s]);
    const thu = tehran(18, 30, 4);
    expect(dueSchedules([s], thu)).toEqual([]);
    const startedToday = sched({ lastStartedAt: wed.minus({ hours: 1 }).toJSDate() });
    expect(dueSchedules([startedToday], wed)).toEqual([]);
  });
});

describe("runLiveConductorTick", () => {
  it("starts the first due schedule and notifies", async () => {
    const { deps, calls } = makeDeps();
    deps.listSchedules = async () => [sched({})];
    await runLiveConductorTick(deps);
    expect(calls.started).toEqual(["LSC-1"]);
    expect(calls.marked).toEqual(["LSC-1"]);
    expect(calls.notify[0]).toMatchObject({ action: "live_schedule_started" });
  });

  it("does not start when a session is already active", async () => {
    const { deps, calls } = makeDeps();
    deps.listSchedules = async () => [sched({})];
    deps.isActiveSession = () => true;
    deps.activeSession = () => ({ scheduleRef: null });
    await runLiveConductorTick(deps);
    expect(calls.started).toEqual([]);
  });

  it("stops a schedule-run session past its end time", async () => {
    const { deps, calls } = makeDeps();
    deps.now = () => tehran(22, 10, 3);
    deps.listSchedules = async () => [sched({})];
    deps.isActiveSession = () => true;
    deps.activeSession = () => ({ scheduleRef: "LSC-1" });
    await runLiveConductorTick(deps);
    expect(calls.stopped).toEqual(["schedule_end"]);
    expect(calls.started).toEqual([]);
  });

  it("does not restart a manually stopped schedule within the same day", async () => {
    const { deps, calls } = makeDeps();
    const now = tehran(19, 0, 3);
    deps.now = () => now;
    deps.listSchedules = async () => [sched({ lastStartedAt: now.minus({ hours: 1 }).toJSDate() })];
    await runLiveConductorTick(deps);
    expect(calls.started).toEqual([]);
  });

  it("records schedule errors and notifies", async () => {
    const { deps, calls } = makeDeps();
    deps.listSchedules = async () => [sched({})];
    deps.startSession = async () => {
      throw new Error("boom");
    };
    deps.markScheduleError = async (id, error) => {
      calls.marked.push(`${id}:${error}`);
    };
    await runLiveConductorTick(deps);
    expect(calls.marked[0]).toBe("LSC-1:boom");
    expect(calls.notify[0]).toMatchObject({ action: "live_schedule_error" });
  });

  it("keeps an active non-schedule session untouched", async () => {
    const { deps, calls } = makeDeps();
    deps.listSchedules = async () => [sched({})];
    deps.isActiveSession = () => true;
    deps.activeSession = () => ({ scheduleRef: null });
    await runLiveConductorTick(deps);
    expect(calls.stopped).toEqual([]);
    expect(calls.started).toEqual([]);
  });
});
