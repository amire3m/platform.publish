import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/providers", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("@/lib/fetch-timeout", () => ({
  timedFetch: vi.fn().mockResolvedValue({ ok: false }),
}));

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  afterEach(() => cleanup());

  it("anchors the mobile sidebar to the viewport with internally scrolling navigation", () => {
    render(
      <AppShell user={{ name: "Test User", role: "admin" }}>
        <div>Page content</div>
      </AppShell>,
    );

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveClass("top-0", "bottom-0", "flex", "flex-col", "overflow-hidden");
    expect(sidebar).not.toHaveClass("inset-y-0");

    const navigation = screen.getByRole("navigation");
    expect(navigation).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(navigation).not.toHaveAttribute("style");
  });
});
