import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildMirrorSourceUrl } from "./telegram-url";

describe("buildMirrorSourceUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a mirror source valid for at least thirty days of upstream backlog", () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example");
    vi.stubEnv("JWT_SECRET", "test-secret");

    const url = buildMirrorSourceUrl("telegram-file-1");
    const token = url?.split("/").at(-1) ?? "";
    const payload = jwt.decode(token) as { iat: number; exp: number };

    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(30 * 24 * 60 * 60);
  });

  it("fails closed when no JWT secret is configured", () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example");
    vi.stubEnv("JWT_SECRET", "");

    expect(buildMirrorSourceUrl("telegram-file-1")).toBeNull();
  });

  it.each([
    "http://app.example",
    "https://localhost:3000",
    "https://localhost.",
    "https://service.local.",
    "https://service.internal.",
    "https://127.0.0.1",
    "https://10.0.0.8",
    "https://172.16.0.8",
    "https://192.168.1.8",
    "https://[::ffff:127.0.0.1]",
    "https://[::ffff:10.0.0.1]",
    "https://app.example/base",
    "https://user:pass@app.example",
  ])("rejects an unsafe mirror source origin: %s", (baseUrl) => {
    vi.stubEnv("APP_BASE_URL", baseUrl);
    vi.stubEnv("JWT_SECRET", "test-secret");

    expect(buildMirrorSourceUrl("telegram-file-1")).toBeNull();
  });
});
