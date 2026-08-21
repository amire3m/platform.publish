import { describe, expect, it, vi } from "vitest";

import { createRequestGenerationGuard } from "./analytics-controls";
import { runAnalyticsSync } from "./sync-controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function successfulResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: {
        results: [{ accountId: "account-1", status: "synced" as const, snapshotCount: 7 }],
        succeeded: 1,
        failed: 0,
        skipped: 0,
      },
    }),
  };
}

function setup() {
  const generation = createRequestGenerationGuard();
  let currentFilterKey = "account-1\u000030\u0000account";
  const pendingFetch = deferred<ReturnType<typeof successfulResponse>>();
  const hooks = {
    setResults: vi.fn(),
    setError: vi.fn(),
    setFeedbackFilterKey: vi.fn(),
    setSyncing: vi.fn(),
    showToast: vi.fn(),
    revalidateOverview: vi.fn().mockResolvedValue(undefined),
    revalidateAccounts: vi.fn().mockResolvedValue(undefined),
  };
  const operation = runAnalyticsSync({
    accountId: "account-1",
    permissions: ["view_analytics"],
    allowedAccountIds: [],
    requestFilterKey: currentFilterKey,
    generation,
    getCurrentFilterKey: () => currentFilterKey,
    fetchSync: () => pendingFetch.promise,
    ...hooks,
  });

  return {
    hooks,
    operation,
    pendingFetch,
    changeFilter: () => {
      currentFilterKey = "account-2\u000030\u0000account";
    },
  };
}

describe("analytics sync controller", () => {
  it("suppresses every context-sensitive effect from a stale successful response and still cleans up syncing", async () => {
    const { changeFilter, hooks, operation, pendingFetch } = setup();
    changeFilter();

    pendingFetch.resolve(successfulResponse());
    await operation;

    expect(hooks.setResults.mock.calls).toEqual([[null]]);
    expect(hooks.setError.mock.calls).toEqual([[null]]);
    expect(hooks.setFeedbackFilterKey.mock.calls).toEqual([[null]]);
    expect(hooks.showToast).not.toHaveBeenCalled();
    expect(hooks.revalidateOverview).not.toHaveBeenCalled();
    expect(hooks.revalidateAccounts).not.toHaveBeenCalled();
    expect(hooks.setSyncing.mock.calls).toEqual([[true], [false]]);
  });

  it("applies results, toast, and both revalidations when the filter context is unchanged", async () => {
    const { hooks, operation, pendingFetch } = setup();

    pendingFetch.resolve(successfulResponse());
    await operation;

    expect(hooks.setResults).toHaveBeenLastCalledWith([
      { accountId: "account-1", status: "synced", snapshotCount: 7 },
    ]);
    expect(hooks.setError.mock.calls).toEqual([[null]]);
    expect(hooks.setFeedbackFilterKey).toHaveBeenLastCalledWith("account-1\u000030\u0000account");
    expect(hooks.showToast).toHaveBeenCalledWith(expect.stringContaining("۱ موفق"), "success");
    expect(hooks.revalidateOverview).toHaveBeenCalledTimes(1);
    expect(hooks.revalidateAccounts).toHaveBeenCalledTimes(1);
    expect(hooks.setSyncing.mock.calls).toEqual([[true], [false]]);
  });

  it("suppresses a rejected stale response and still cleans up syncing", async () => {
    const { changeFilter, hooks, operation, pendingFetch } = setup();
    changeFilter();

    pendingFetch.reject(new Error("late failure"));
    await operation;

    expect(hooks.setResults.mock.calls).toEqual([[null]]);
    expect(hooks.setError.mock.calls).toEqual([[null]]);
    expect(hooks.setFeedbackFilterKey.mock.calls).toEqual([[null]]);
    expect(hooks.showToast).not.toHaveBeenCalled();
    expect(hooks.revalidateOverview).not.toHaveBeenCalled();
    expect(hooks.revalidateAccounts).not.toHaveBeenCalled();
    expect(hooks.setSyncing.mock.calls).toEqual([[true], [false]]);
  });
});
