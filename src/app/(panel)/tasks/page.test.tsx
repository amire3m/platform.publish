import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/lib/workflow/client", () => ({ fetchWorkflowApi: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

import { fetchWorkflowApi } from "@/lib/workflow/client";
import TasksPage from "./page";

const mockedFetch = vi.mocked(fetchWorkflowApi);

describe("TasksPage cutover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.startsWith("/api/tasks?")) return { items: [], nextCursor: null, total: 0 };
      if (url === "/api/content-room/products") return [];
      throw new Error("unexpected url " + url);
    });
  });

  afterEach(() => cleanup());

  it("loads only the persistent task board endpoint", async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <TasksPage />
      </SWRConfig>,
    );
    expect(await screen.findByRole("heading", { name: "کارها" })).toBeInTheDocument();
    const urls = mockedFetch.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith("/api/tasks?column="))).toBe(true);
    expect(urls.some((url) => url.includes("/api/tasks/mine"))).toBe(false);
  });
});

