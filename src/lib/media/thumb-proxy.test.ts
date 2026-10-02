import { describe, expect, it } from "vitest";
import { isProxiableImageUrl, thumbUrl } from "./thumb-proxy";

describe("thumb-proxy helper", () => {
  it("proxies YouTube/Google image hosts", () => {
    expect(thumbUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(
      "/api/thumb?u=https%3A%2F%2Fi.ytimg.com%2Fvi%2Fabc%2Fhqdefault.jpg",
    );
    expect(thumbUrl("https://yt3.ggpht.com/a-/x.jpg")).toMatch(/^\/api\/thumb\?u=/);
    expect(thumbUrl("https://lh3.googleusercontent.com/a/x.jpg")).toMatch(/^\/api\/thumb\?u=/);
  });

  it("passes through local and other hosts", () => {
    expect(thumbUrl("/brand/logo.png")).toBe("/brand/logo.png");
    expect(thumbUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(thumbUrl(null)).toBeNull();
    expect(thumbUrl("http://i.ytimg.com/a.jpg")).toBe("http://i.ytimg.com/a.jpg");
  });

  it("detects proxiable hosts", () => {
    expect(isProxiableImageUrl("https://i9.ytimg.com/x.jpg")).toBe(true);
    expect(isProxiableImageUrl("https://evil.com/x.jpg")).toBe(false);
    expect(isProxiableImageUrl(null)).toBe(false);
  });
});
