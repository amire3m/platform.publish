import { describe, expect, it } from "vitest";
import { buildChecklistTasks, isTasksAdmin, type PartTaskInput } from "./tasks";

function part(overrides: Partial<PartTaskInput> = {}): PartTaskInput {
  return {
    partId: "CPP-1",
    productId: "CPR-1",
    productTitle: "X",
    channel: "zed_revayat",
    channelLabel: "ضد روایت",
    partNumber: 1,
    activities: {},
    previouslyPublished: false,
    ...overrides,
  };
}

describe("buildChecklistTasks", () => {
  it("returns first missing step per job", () => {
    const tasks = buildChecklistTasks([part()], ["full_editor"]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].activity).toBe("raw_telegram");
    expect(tasks[0].remainingForJob).toBe(6);
    expect(tasks[0].href).toBe("/content-room/CPR-1");
  });

  it("skips jobs with nothing missing and previously_published parts", () => {
    const done = {
      raw_telegram: true,
      raw_compressed: true,
      yt_check_upload: true,
      copyright_report: true,
      music_replaced: true,
      final_full: true,
    };
    expect(buildChecklistTasks([part({ activities: done })], ["full_editor"])).toHaveLength(0);
    expect(buildChecklistTasks([part({ previouslyPublished: true })], ["full_editor"])).toHaveLength(0);
  });

  it("unions queues for multi-job users and ignores publisher_admin in checklist", () => {
    const tasks = buildChecklistTasks([part()], ["full_editor", "graphic", "publisher_admin"]);
    expect(tasks.map((t) => t.job).sort()).toEqual(["full_editor", "graphic"]);
  });

  it("advances to the next missing step", () => {
    const tasks = buildChecklistTasks(
      [part({ activities: { raw_telegram: true, raw_compressed: true } })],
      ["full_editor"],
    );
    expect(tasks[0].activity).toBe("yt_check_upload");
    expect(tasks[0].remainingForJob).toBe(4);
  });
});

describe("isTasksAdmin", () => {
  it("detects owner/manager/publisher_admin", () => {
    expect(isTasksAdmin("owner", [])).toBe(true);
    expect(isTasksAdmin("manager", [])).toBe(true);
    expect(isTasksAdmin("editor", ["publisher_admin"])).toBe(true);
    expect(isTasksAdmin("editor", ["graphic"])).toBe(false);
  });
});
