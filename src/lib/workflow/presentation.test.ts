import { describe, expect, it } from "vitest";

import { workflowStatusPresentation } from "./presentation";

describe("workflowStatusPresentation", () => {
  it("maps changes_requested", () => {
    expect(workflowStatusPresentation("changes_requested")).toEqual({
      label: "اصلاح شود",
      tone: "danger",
      icon: "alert",
    });
  });

  it("maps published", () => {
    expect(workflowStatusPresentation("published")).toEqual({
      label: "منتشرشده",
      tone: "success",
      icon: "check",
    });
  });
});
