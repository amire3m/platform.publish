import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DedicatedPlayer } from "./DedicatedPlayer";

describe("DedicatedPlayer cover fallback", () => {
  it("shows a title card until play when no poster is provided", () => {
    const { container } = render(<DedicatedPlayer src="https://example.com/v.mp4" title="قسمت 1 — ویدیو کامل" />);
    expect(screen.getByText("قسمت 1 — ویدیو کامل", { selector: "p" })).toBeInTheDocument();
    const video = container.querySelector("video")!;
    fireEvent.play(video);
    expect(screen.queryByText("قسمت 1 — ویدیو کامل", { selector: "p" })).not.toBeInTheDocument();
  });

  it("shows no title card when a poster is provided", () => {
    render(<DedicatedPlayer src="https://example.com/v.mp4" poster="https://example.com/c.jpg" title="قسمت 1 — ویدیو کامل" />);
    expect(screen.queryByText("قسمت 1 — ویدیو کامل", { selector: "p" })).not.toBeInTheDocument();
  });
});
