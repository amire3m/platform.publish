import { describe, it, expect } from "vitest";
import { parsePersistedTargets, targetForWorkflowPublication } from "./content-targets";

describe("content-targets", () => {
  it("preserves workflow_publication_id", () => {
    const target = parsePersistedTargets([
      { platform: "youtube", account_id: "a1", workflow_publication_id: "wp1", status: "approved" },
    ])[0];
    expect(target.workflow_publication_id).toBe("wp1");
    expect(targetForWorkflowPublication([target], "wp1")).toBe(target);
    expect(targetForWorkflowPublication([target], "missing")).toBeUndefined();
  });

  it("parses snake_case storage fields and retry/result fields", () => {
    const raw = [
      {
        platform: "instagram",
        account_id: "acc1",
        content_type: "reel",
        status: "scheduled",
        publish_at_utc: "2026-08-22T09:00:00.000Z",
        publish_at_jalali: "1405/05/31 13:30",
        fields: { privacyStatus: "public" },
        attempts: 2,
        next_retry_at: "2026-08-22T09:05:00.000Z",
        external_id: "ext123",
        permalink: "https://example.com/p/123",
        last_error: "timeout",
        workflow_publication_id: "wp2",
      },
    ];
    const [t] = parsePersistedTargets(raw);
    expect(t.platform).toBe("instagram");
    expect(t.account_id).toBe("acc1");
    expect(t.content_type).toBe("reel");
    expect(t.status).toBe("scheduled");
    expect(t.publish_at_utc).toBe("2026-08-22T09:00:00.000Z");
    expect(t.publish_at_jalali).toBe("1405/05/31 13:30");
    expect(t.attempts).toBe(2);
    expect(t.next_retry_at).toBe("2026-08-22T09:05:00.000Z");
    expect(t.external_id).toBe("ext123");
    expect(t.permalink).toBe("https://example.com/p/123");
    expect(t.last_error).toBe("timeout");
    expect(t.workflow_publication_id).toBe("wp2");
  });

  it("handles missing optional fields and empty input", () => {
    expect(parsePersistedTargets([])).toEqual([]);
    expect(parsePersistedTargets(null as unknown as unknown[])).toEqual([]);
    expect(parsePersistedTargets(undefined as unknown as unknown[])).toEqual([]);
    const [t] = parsePersistedTargets([{ platform: "youtube", account_id: "a1" }]);
    expect(t.workflow_publication_id).toBeUndefined();
    expect(t.status).toBeUndefined();
  });

  it("does not match by platform/account, only by workflow_publication_id", () => {
    const targets = parsePersistedTargets([
      { platform: "youtube", account_id: "a1", workflow_publication_id: "wp1", status: "approved" },
      { platform: "youtube", account_id: "a1", workflow_publication_id: "wp2", status: "scheduled" },
    ]);
    expect(targetForWorkflowPublication(targets, "wp1")?.workflow_publication_id).toBe("wp1");
    expect(targetForWorkflowPublication(targets, "wp2")?.workflow_publication_id).toBe("wp2");
    // same platform/account but different workflow id should not match
    expect(targetForWorkflowPublication(targets, "wp1")?.status).toBe("approved");
  });
});
