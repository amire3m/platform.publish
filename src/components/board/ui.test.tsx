import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DemoBadge, MissingBadge, NeedsInput } from "./badges";
import { DataTable } from "./ui";

describe("board shared ui", () => {
  it("renders badges", () => {
    render(<div><DemoBadge /><MissingBadge /><NeedsInput /></div>);
    expect(screen.getByText("داده نمایشی")).toBeInTheDocument();
    expect(screen.getByText("اطلاعات موجود نیست")).toBeInTheDocument();
    expect(screen.getByText("نیازمند تکمیل اطلاعات")).toBeInTheDocument();
  });

  it("sorts and paginates a table", () => {
    const rows = [
      { id: "1", name: "ب", views: 30 },
      { id: "2", name: "الف", views: 100 },
      { id: "3", name: "ج", views: 10 },
    ];
    render(
      <DataTable
        rows={rows}
        columns={[
          { key: "name", label: "نام", render: (r) => r.name },
          { key: "views", label: "بازدید", render: (r) => r.views, sortValue: (r) => r.views },
        ]}
        pageSize={2}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /بازدید/ }));
    const cells = screen.getAllByRole("cell");
    expect(cells[1].textContent).toBe("100");
    fireEvent.click(screen.getByRole("button", { name: "بعدی" }));
    expect(screen.getByText(/صفحه 2 از 2/)).toBeInTheDocument();
  });
});
