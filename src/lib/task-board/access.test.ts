import { describe, expect, it } from "vitest";

import type { TaskActor, TaskAccessRecord } from "./types";
import { canSubmitAssignment, canViewTask, getTaskCapabilities } from "./access";

const editor: TaskActor = {
  id: "USR-EDITOR",
  role: "editor",
  active: true,
  jobFunctions: ["graphic"],
  allowedChannels: ["tamashin"],
};

const openGraphicTask: TaskAccessRecord = {
  status: "open",
  channel: "tamashin",
  assignedJobFunctions: ["graphic"],
  assignmentStatuses: { graphic: "open" },
};

describe("task visibility", () => {
  it("requires both a matching job function and an allowed channel for regular users", () => {
    expect(canViewTask(editor, openGraphicTask)).toBe(true);
    expect(canViewTask(editor, { ...openGraphicTask, channel: "zaviye_no" })).toBe(false);
    expect(canViewTask(editor, { ...openGraphicTask, assignedJobFunctions: ["full_editor"] })).toBe(false);
  });

  it("treats an empty channel scope as all non-hidden channels", () => {
    expect(canViewTask({ ...editor, allowedChannels: [] }, { ...openGraphicTask, channel: "zaviye_no" })).toBe(true);
  });

  it("never exposes hidden channels, including to owners", () => {
    expect(canViewTask({ ...editor, role: "owner" }, { ...openGraphicTask, channel: "shock" })).toBe(false);
  });

  it("gives broad read roles visibility without granting submission", () => {
    const analyst: TaskActor = { ...editor, role: "analyst", jobFunctions: [] };

    expect(canViewTask(analyst, openGraphicTask)).toBe(true);
    expect(canSubmitAssignment(analyst, openGraphicTask, "graphic")).toBe(false);
  });

  it("rejects inactive users before evaluating role or assignment", () => {
    expect(canViewTask({ ...editor, active: false, role: "owner" }, openGraphicTask)).toBe(false);
  });
});

describe("task capabilities", () => {
  it("allows only a matching open assignment to be submitted", () => {
    expect(canSubmitAssignment(editor, openGraphicTask, "graphic")).toBe(true);
    expect(canSubmitAssignment(editor, { ...openGraphicTask, assignmentStatuses: { graphic: "submitted" } }, "graphic")).toBe(false);
    expect(canSubmitAssignment(editor, { ...openGraphicTask, status: "awaiting_approval" }, "graphic")).toBe(false);
  });

  it("derives owner actions from task and assignment state", () => {
    const owner = { ...editor, role: "owner" };

    expect(getTaskCapabilities(owner, openGraphicTask)).toEqual({
      canEdit: true,
      canApprove: false,
      canReturn: false,
      canArchive: true,
    });
    expect(
      getTaskCapabilities(owner, {
        ...openGraphicTask,
        status: "awaiting_approval",
        assignmentStatuses: { graphic: "submitted" },
      }),
    ).toEqual({ canEdit: true, canApprove: true, canReturn: true, canArchive: true });
    expect(getTaskCapabilities(owner, { ...openGraphicTask, status: "completed" })).toEqual({
      canEdit: false,
      canApprove: false,
      canReturn: false,
      canArchive: true,
    });
  });
});
