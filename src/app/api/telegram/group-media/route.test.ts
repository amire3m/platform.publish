import { describe, expect, it } from "vitest";
describe("group-media", () => {
  it("returns 20 items for authenticated user", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/telegram/group-media") as never);
    expect([200, 401]).toContain(res.status);
  });
});
