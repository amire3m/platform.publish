import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/lib/workflow/client", () => ({ fetchWorkflowApi: vi.fn() }));

import { fetchWorkflowApi } from "@/lib/workflow/client";
import TaskBoard from "./TaskBoard";
import { TASK_COLUMN_LABELS } from "./types";

const mockedFetch = vi.mocked(fetchWorkflowApi);

function renderBoard(props: { initialTaskId: string | null }) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0, dedupingInterval: 0 }}>
      <TaskBoard {...props} />
    </SWRConfig>,
  );
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "TSK-1405-000001",
    title: "کاور قسمت پنجم",
    status: "open",
    dueAt: "2026-11-01T08:00:00.000Z",
    productId: null,
    productTitle: null,
    partId: null,
    partNumber: null,
    channel: null,
    version: 1,
    awaitingApprovalAt: null,
    completedAt: null,
    archivedAt: null,
    createdAt: "2026-10-20T08:00:00.000Z",
    assignments: [
      {
        jobFunction: "graphic",
        status: "submitted",
        submissionNote: null,
        submissionUrl: null,
        submittedBy: "u2",
        submittedByName: "گرافیست",
        submittedAt: "2026-10-21T08:00:00.000Z",
        canSubmit: false,
      },
      {
        jobFunction: "publisher_admin",
        status: "open",
        submissionNote: null,
        submissionUrl: null,
        submittedBy: null,
        submittedByName: null,
        submittedAt: null,
        canSubmit: false,
      },
    ],
    capabilities: { canEdit: true, canApprove: false, canReturn: false, canArchive: true },
    ...overrides,
  };
}

function makeDetail() {
  return {
    ...makeCard(),
    description: "توضیح کار",
    createdBy: "owner1",
    createdByName: "مالک",
    updatedAt: "2026-10-24T08:00:00.000Z",
    recentHistory: [
      {
        id: "WEV-1",
        entityType: "task",
        entityId: "TSK-1405-000001",
        action: "task_created",
        before: null,
        after: null,
        actorUserId: "owner1",
        actorName: "مالک",
        reason: null,
        createdAt: "2026-10-20T08:00:00.000Z",
      },
    ],
  };
}

function installDefaultMock() {
  mockedFetch.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") {
      return {
        id: "owner1",
        name: "مالک",
        username: "owner",
        role: "owner",
        telegramId: "100",
        permissions: [],
        allowedAccountIds: null,
        allowedChannels: [],
        jobFunctions: [],
        impersonatedBy: null,
        impersonationExpiresAt: null,
      };
    }
    if (url.startsWith("/api/tasks/TSK-")) return makeDetail();
    if (url.startsWith("/api/tasks?")) {
      const parsed = new URL(url, "http://test");
      if (parsed.searchParams.get("search") === "zzz") return { items: [], nextCursor: null, total: 0 };
      if (parsed.searchParams.get("column") === "open") return { items: [makeCard()], nextCursor: null, total: 1 };
      return { items: [], nextCursor: null, total: 0 };
    }
    if (url === "/api/content-room/products") return [];
    throw new Error("unexpected url " + url);
  });
}

describe("TaskBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1280);
    installDefaultMock();
  });

  afterEach(() => {
    cleanup();
    setViewport(1280);
  });

  it("renders one shared card with independent assignment chips", async () => {
    renderBoard({ initialTaskId: null });
    expect(await screen.findByText("کاور قسمت پنجم")).toBeInTheDocument();
    expect(screen.getByText("گرافیست · ارسال‌شده")).toBeInTheDocument();
    expect(screen.getByText("ادمین انتشار · باز")).toBeInTheDocument();
    expect(screen.getAllByText("کاور قسمت پنجم")).toHaveLength(1);
  });

  it("uses status tabs instead of three visible columns on mobile", async () => {
    setViewport(390);
    renderBoard({ initialTaskId: null });
    expect(await screen.findByRole("tab", { name: TASK_COLUMN_LABELS.open })).toHaveAttribute("aria-selected", "true");
    const awaitingSection = document.querySelector(`section[aria-label="${TASK_COLUMN_LABELS.awaiting_approval}"]`);
    expect(awaitingSection).not.toBeNull();
    expect(awaitingSection).toHaveAttribute("hidden");
    expect(screen.getByRole("region", { name: TASK_COLUMN_LABELS.open })).toBeVisible();
  });

  it("keeps loaded pages when switching mobile tabs", async () => {
    setViewport(390);
    renderBoard({ initialTaskId: null });
    expect(await screen.findByText("کاور قسمت پنجم")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: TASK_COLUMN_LABELS.awaiting_approval }));
    fireEvent.click(screen.getByRole("tab", { name: TASK_COLUMN_LABELS.open }));
    expect(screen.getByText("کاور قسمت پنجم")).toBeInTheDocument();
  });

  it("shows owner-only create and archive controls from capabilities", async () => {
    renderBoard({ initialTaskId: null });
    expect(await screen.findByRole("button", { name: "کار جدید" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نمایش بایگانی" })).toBeInTheDocument();
  });

  it("shows create control to an owner when every task column is empty", async () => {
    mockedFetch.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") {
        return {
          id: "owner1",
          name: "مالک",
          username: "owner",
          role: "owner",
          telegramId: "100",
          permissions: [],
          allowedAccountIds: null,
          allowedChannels: [],
          jobFunctions: [],
          impersonatedBy: null,
          impersonationExpiresAt: null,
        };
      }
      if (url.startsWith("/api/tasks?")) return { items: [], nextCursor: null, total: 0 };
      if (url === "/api/content-room/products") return [];
      throw new Error("unexpected url " + url);
    });
    renderBoard({ initialTaskId: null });
    expect(await screen.findByRole("button", { name: "کار جدید" })).toBeInTheDocument();
  });

  it("hides owner controls when capabilities deny them", async () => {
    mockedFetch.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") {
        return {
          id: "worker1",
          name: "همکار",
          username: "worker",
          role: "editor",
          telegramId: "1",
          permissions: [],
          allowedAccountIds: null,
          allowedChannels: [],
          jobFunctions: ["graphic"],
          impersonatedBy: null,
          impersonationExpiresAt: null,
        };
      }
      if (url.startsWith("/api/tasks?")) {
        const parsed = new URL(url, "http://test");
        if (parsed.searchParams.get("column") === "open") {
          return { items: [makeCard({ capabilities: { canEdit: false, canApprove: false, canReturn: false, canArchive: false } })], nextCursor: null, total: 1 };
        }
        return { items: [], nextCursor: null, total: 0 };
      }
      if (url === "/api/content-room/products") return [];
      return { items: [], nextCursor: null, total: 0 };
    });
    renderBoard({ initialTaskId: null });
    expect(await screen.findByText("کاور قسمت پنجم")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "کار جدید" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "نمایش بایگانی" })).not.toBeInTheDocument();
  });

  it("requests completed work without an explicit range by default", async () => {
    renderBoard({ initialTaskId: null });
    await screen.findByText("کاور قسمت پنجم");
    const completedCall = mockedFetch.mock.calls.map((call) => String(call[0])).find((url) => url.includes("column=completed"));
    expect(completedCall).toBeDefined();
    expect(completedCall).not.toContain("completedFrom");
  });

  it("shows overdue text for past due dates", async () => {
    mockedFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/tasks?")) {
        const parsed = new URL(url, "http://test");
        if (parsed.searchParams.get("column") === "open") {
          return { items: [makeCard({ dueAt: "2020-01-01T00:00:00.000Z" })], nextCursor: null, total: 1 };
        }
        return { items: [], nextCursor: null, total: 0 };
      }
      if (url === "/api/content-room/products") return [];
      throw new Error("unexpected url " + url);
    });
    renderBoard({ initialTaskId: null });
    expect(await screen.findByText("موعد گذشته")).toBeInTheDocument();
  });

  it("shows a filtered empty state with a clear action", async () => {
    renderBoard({ initialTaskId: null });
    expect(await screen.findByText("کاور قسمت پنجم")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("جستجو"), { target: { value: "zzz" } });
    const openRegion = await screen.findByRole("region", { name: TASK_COLUMN_LABELS.open });
    expect(await within(openRegion).findByText("موردی با این فیلترها یافت نشد")).toBeInTheDocument();
    fireEvent.click(within(openRegion).getByRole("button", { name: "پاک کردن فیلترها" }));
    expect(await screen.findByText("کاور قسمت پنجم")).toBeInTheDocument();
  });

  it("recovers from a column error with retry", async () => {
    let openCalls = 0;
    mockedFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/tasks?")) {
        const parsed = new URL(url, "http://test");
        if (parsed.searchParams.get("column") === "open") {
          openCalls += 1;
          if (openCalls === 1) throw new Error("boom");
          return { items: [makeCard()], nextCursor: null, total: 1 };
        }
        return { items: [], nextCursor: null, total: 0 };
      }
      if (url === "/api/content-room/products") return [];
      throw new Error("unexpected url " + url);
    });
    renderBoard({ initialTaskId: null });
    const openRegion = await screen.findByRole("region", { name: TASK_COLUMN_LABELS.open });
    expect(await within(openRegion).findByText("خطا در دریافت ستون")).toBeInTheDocument();
    fireEvent.click(within(openRegion).getByRole("button", { name: "تلاش دوباره" }));
    expect(await within(openRegion).findByText("کاور قسمت پنجم")).toBeInTheDocument();
  });

  it("opens the detail panel for a deep-linked task", async () => {
    renderBoard({ initialTaskId: "TSK-1405-000001" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("توضیح کار")).toBeInTheDocument();
    expect(within(dialog).getByText("گرافیست · ارسال‌شده")).toBeInTheDocument();
  });

  it("opens detail with keyboard-operable cards", async () => {
    renderBoard({ initialTaskId: null });
    const cards = await screen.findAllByRole("button", { name: /کاور قسمت پنجم/ });
    fireEvent.click(cards[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

