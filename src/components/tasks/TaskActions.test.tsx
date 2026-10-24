import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/lib/workflow/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow/client")>();
  return { ...actual, fetchWorkflowApi: vi.fn() };
});

import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import TaskEditorDialog from "./TaskEditorDialog";
import TaskSubmitDialog from "./TaskSubmitDialog";
import TaskReturnDialog from "./TaskReturnDialog";

const mockedFetch = vi.mocked(fetchWorkflowApi);

function renderWithSWR(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "TSK-1405-000001",
    title: "کاور قسمت پنجم",
    status: "open",
    dueAt: null,
    productId: null,
    productTitle: null,
    partId: null,
    partNumber: null,
    channel: null,
    version: 3,
    awaitingApprovalAt: null,
    completedAt: null,
    archivedAt: null,
    createdAt: "2026-10-20T08:00:00.000Z",
    description: "توضیح",
    createdBy: "owner1",
    createdByName: "مالک",
    updatedAt: "2026-10-24T08:00:00.000Z",
    recentHistory: [],
    assignments: [
      {
        jobFunction: "graphic",
        status: "submitted",
        submissionNote: "نسخه اول",
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
        canSubmit: true,
      },
    ],
    capabilities: { canEdit: true, canApprove: false, canReturn: true, canArchive: true },
    ...overrides,
  };
}

describe("task mutation dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockImplementation(async (url: string) => {
      if (url === "/api/content-room/products") return [];
      throw new Error("unexpected url " + url);
    });
  });

  afterEach(() => cleanup());

  it("requires at least one job function before create", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithSWR(<TaskEditorDialog open mode="create" onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("عنوان"), { target: { value: "کاور قسمت پنجم" } });
    fireEvent.click(screen.getByRole("button", { name: "ساخت کار" }));
    expect(await screen.findByText("حداقل یک سمت را انتخاب کنید.")).toBeInTheDocument();
    expect(mockedFetch.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("creates a task with the selected functions", async () => {
    const created = makeTask({ version: 1 });
    mockedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/content-room/products") return [];
      if (url === "/api/tasks" && init?.method === "POST") return created;
      throw new Error("unexpected url " + url);
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithSWR(<TaskEditorDialog open mode="create" onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("عنوان"), { target: { value: "کاور قسمت پنجم" } });
    fireEvent.click(screen.getByLabelText("گرافیست"));
    fireEvent.click(screen.getByRole("button", { name: "ساخت کار" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
    expect(onClose).toHaveBeenCalled();
    const postCall = mockedFetch.mock.calls.find((call) => call[0] === "/api/tasks");
    expect(JSON.parse(String((postCall?.[1] as RequestInit)?.body))).toMatchObject({
      title: "کاور قسمت پنجم",
      jobFunctions: ["graphic"],
    });
  });

  it("sends the expected version when editing", async () => {
    const task = makeTask();
    const updated = makeTask({ version: 4, title: "عنوان جدید" });
    mockedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/content-room/products") return [];
      if (url === "/api/tasks/TSK-1405-000001" && init?.method === "PATCH") return updated;
      throw new Error("unexpected url " + url);
    });
    const onSaved = vi.fn();
    renderWithSWR(<TaskEditorDialog open mode="edit" task={task as never} onClose={vi.fn()} onSaved={onSaved} />);
    const titleInput = screen.getByLabelText("عنوان") as HTMLInputElement;
    expect(titleInput.value).toBe("کاور قسمت پنجم");
    fireEvent.change(titleInput, { target: { value: "عنوان جدید" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(JSON.parse(String((mockedFetch.mock.calls.find((call) => call[0] === "/api/tasks/TSK-1405-000001")?.[1] as RequestInit)?.body))).toMatchObject({
      expectedVersion: 3,
      title: "عنوان جدید",
    });
  });

  it("keeps form values when the server reports a version conflict", async () => {
    const task = makeTask({ version: 3, assignments: [makeTask().assignments[1]] });
    mockedFetch.mockRejectedValue(new WorkflowApiError("این کار تغییر کرده است.", 409, "VERSION_CONFLICT"));
    renderWithSWR(
      <TaskSubmitDialog open task={task as never} jobFunction="publisher_admin" onClose={vi.fn()} onSaved={vi.fn()} onConflictRefresh={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("توضیح تحویل"), { target: { value: "نسخه نهایی" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال برای تأیید" }));
    expect(await screen.findByText("این کار تغییر کرده است.")).toBeInTheDocument();
    expect((screen.getByLabelText("توضیح تحویل") as HTMLTextAreaElement).value).toBe("نسخه نهایی");
  });

  it("rejects an invalid submission url", async () => {
    const task = makeTask();
    renderWithSWR(
      <TaskSubmitDialog open task={task as never} jobFunction="publisher_admin" onClose={vi.fn()} onSaved={vi.fn()} onConflictRefresh={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("لینک تحویل"), { target: { value: "file:///tmp/a" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال برای تأیید" }));
    expect(await screen.findByText("لینک تحویل باید با http یا https شروع شود.")).toBeInTheDocument();
    expect(mockedFetch).not.toHaveBeenCalledWith(expect.stringContaining("/submit"), expect.anything());
  });

  it("submits an assignment", async () => {
    const task = makeTask();
    const saved = makeTask({ version: 4 });
    mockedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/submit") && init?.method === "POST") return saved;
      throw new Error("unexpected url " + url);
    });
    const onSaved = vi.fn();
    renderWithSWR(
      <TaskSubmitDialog open task={task as never} jobFunction="publisher_admin" onClose={vi.fn()} onSaved={onSaved} onConflictRefresh={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("توضیح تحویل"), { target: { value: "انجام شد" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال برای تأیید" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const body = JSON.parse(String((mockedFetch.mock.calls[0]?.[1] as RequestInit)?.body));
    expect(body).toMatchObject({ expectedVersion: 3, submissionNote: "انجام شد" });
  });

  it("requires a reason and selected functions when returning", async () => {
    const task = makeTask();
    renderWithSWR(<TaskReturnDialog open task={task as never} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "برگشت برای اصلاح" }));
    expect(await screen.findByText("دلیل برگشت را وارد کنید.")).toBeInTheDocument();
    expect(screen.getByText("حداقل یک سمت را انتخاب کنید.")).toBeInTheDocument();
    expect(mockedFetch).not.toHaveBeenCalledWith(expect.stringContaining("/return"), expect.anything());
  });

  it("returns selected functions with a reason", async () => {
    const task = makeTask();
    const saved = makeTask({ version: 4, status: "open" });
    mockedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/return") && init?.method === "POST") return saved;
      throw new Error("unexpected url " + url);
    });
    const onSaved = vi.fn();
    renderWithSWR(<TaskReturnDialog open task={task as never} onClose={vi.fn()} onSaved={onSaved} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("گرافیست"));
    fireEvent.change(screen.getByLabelText("دلیل برگشت"), { target: { value: "ابعاد اصلاح شود" } });
    fireEvent.click(screen.getByRole("button", { name: "برگشت برای اصلاح" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const body = JSON.parse(String((mockedFetch.mock.calls[0]?.[1] as RequestInit)?.body));
    expect(body).toMatchObject({ jobFunctions: ["graphic"], reason: "ابعاد اصلاح شود" });
  });
});

