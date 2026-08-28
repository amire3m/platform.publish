import { describe, expect, it } from "vitest";
import { beautifyContent } from "./beautify";
describe("beautify", () => {
  it("renders Persian without JSON", () => {
    const {text} = beautifyContent({id:"CNT-1", title:"تست", status:"in_review", approvalStatus:"pending", createdAt:new Date().toISOString(), platformTargets:[{platform:"youtube"}]});
    expect(text).not.toContain("TGDB");
    expect(text).not.toContain('"entity"');
    expect(text).toContain("در بررسی");
    expect(text).toContain("🆔");
  });
});
