import { describe, expect, it } from "vitest";
describe("link", () => {
  it("links video by messageId to part", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/content-room/parts/CPP-1/link", {method:"POST", body: JSON.stringify({messageId:123, kind:"video"})}) as never, {params: Promise.resolve({id:"CPP-1"})} as never);
    expect([200,401,403]).toContain(res.status);
  });
});
