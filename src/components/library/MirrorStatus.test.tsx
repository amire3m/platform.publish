import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MirrorStatusBox } from "./MirrorStatus";

describe("MirrorStatusBox", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("explains when the upstream remote-upload queue has no free capacity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          items: [{
            id: "mirror-1",
            partId: "part-1",
            fileId: "file-1",
            provider: "vids.st",
            remoteId: null,
            remoteTaskId: "submitting:claim-1",
            remoteUrl: null,
            status: "uploading",
            error: "نتیجه ارسال نامشخص است.",
            productTitle: "قسمت آزمایشی",
            updatedAt: null,
          }],
          counts: { ready: 363, uploading: 1, queued: 0, error: 99 },
          canRecover: true,
          capacity: { active_remote: 1, queued_remote: 56, free_remote: 0, max_remote: 1, max_concurrent: 1 },
          capacityError: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    render(<MirrorStatusBox />);
    fireEvent.click(await screen.findByRole("button", { name: /وضعیت آینه‌ها/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("ظرفیت سرویس میرور پر است");
    expect(screen.getByRole("status")).toHaveTextContent("۵۶ فایل");
    expect(screen.getByRole("status")).toHaveTextContent("ظرفیت آزاد: ۰");
    expect(screen.getByRole("button", { name: /تلاش مجدد همه خطاها/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "بازگردانی دستی به صف" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("ممکن است باعث آپلود تکراری شود"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/mirrors/retry",
      expect.objectContaining({ body: JSON.stringify({ fileId: "file-1", forceUncertain: true }) }),
    ));
  });
});
