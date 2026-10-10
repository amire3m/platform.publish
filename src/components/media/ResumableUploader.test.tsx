import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

import { ResumableUploader } from "./ResumableUploader";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pickFile(): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], "p1.mp4", { type: "video/mp4" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ResumableUploader", () => {
  it("uploads the picked file with binding and reports the new version", async () => {
    const uploadFn = vi.fn(async () => ({ assetId: "MAS-1", revisionId: "MRV-1", version: 4 }));
    const onDone = vi.fn();
    render(
      <ResumableUploader
        binding={{ partId: "CPP-1", productId: "CPR-1", channel: "zed_revayat", kind: "highlight" }}
        uploadFn={uploadFn as never}
        onDone={onDone}
      />,
    );
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: /شروع آپلود/ }));
    await waitFor(() => expect(uploadFn).toHaveBeenCalledTimes(1));
    expect(uploadFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "p1.mp4" }),
      expect.objectContaining({ partId: "CPP-1", kind: "highlight" }),
      expect.anything(),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ version: 4 })));
    expect(screen.getByText(/نسخه ۴|نسخه 4/)).not.toBeNull();
  });

  it("shows the error and allows retry when upload fails", async () => {
    const uploadFn = vi.fn(async () => {
      throw new Error("قطع شد");
    });
    render(<ResumableUploader binding={{ kind: "final" }} uploadFn={uploadFn as never} />);
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: /شروع آپلود/ }));
    await waitFor(() => expect(screen.getByText(/قطع شد/)).not.toBeNull());
    expect(uploadFn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /تلاش مجدد/ }));
    await waitFor(() => expect(uploadFn).toHaveBeenCalledTimes(2));
  });
});
