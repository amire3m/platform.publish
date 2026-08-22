import { describe, expect, it, vi } from "vitest";

import { buildSheetCsvUrl, fetchSheetCsv, parsePublicSheetUrl } from "./sheet-fetch";

describe("parsePublicSheetUrl", () => {
  it("parses docs.google.com sheet URL with gid", () => {
    expect(parsePublicSheetUrl("https://docs.google.com/spreadsheets/d/abc123/edit#gid=42")).toEqual({
      sheetId: "abc123",
      gid: "42",
    });
  });

  it("rejects non-Google host", () => {
    expect(() => parsePublicSheetUrl("https://evil.test/spreadsheets/d/abc")).toThrow(/Google Sheet/);
  });

  it("parses URL without gid defaults to 0", () => {
    expect(parsePublicSheetUrl("https://docs.google.com/spreadsheets/d/abc123/edit")).toEqual({
      sheetId: "abc123",
      gid: "0",
    });
  });

  it("rejects wrong path without /spreadsheets/d/", () => {
    expect(() => parsePublicSheetUrl("https://docs.google.com/other/d/abc123")).toThrow(/Google Sheet/);
  });
});

describe("buildSheetCsvUrl", () => {
  it("builds csv export url", () => {
    expect(buildSheetCsvUrl({ sheetId: "abc123", gid: "42" })).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=42",
    );
  });
});

function depsRedirectingTo(location: string) {
  const fetchMock = vi.fn(async () =>
    ({
      status: 302,
      ok: false,
      headers: {
        get: (name: string) => (name.toLowerCase() === "location" ? location : null),
      },
      body: null,
      text: async () => "",
    }) as unknown as Response,
  );
  return { fetch: fetchMock as unknown as typeof fetch };
}

function depsWithBytes(byteLength: number) {
  const bigText = "a".repeat(byteLength);
  const fetchMock = vi.fn(async () =>
    ({
      status: 200,
      ok: true,
      headers: {
        get: () => null,
      },
      body: null,
      text: async () => bigText,
      arrayBuffer: async () => new TextEncoder().encode(bigText).buffer,
      // simulate stream via body
    }) as unknown as Response,
  );
  return { fetch: fetchMock as unknown as typeof fetch };
}

describe("fetchSheetCsv", () => {
  const ref = { sheetId: "abc123", gid: "42" };

  it("rejects redirect to non-allowlisted host", async () => {
    await expect(fetchSheetCsv(ref, depsRedirectingTo("https://evil.test/data"))).rejects.toThrow(/redirect/);
  });

  it("rejects oversized payload", async () => {
    await expect(fetchSheetCsv(ref, depsWithBytes(5 * 1024 * 1024 + 1))).rejects.toThrow(/حجم/);
  });

  it("does not leak full URL in error", async () => {
    try {
      await fetchSheetCsv(ref, depsRedirectingTo("https://evil.test/data"));
      expect.unreachable("should throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("abc123");
      expect(msg).not.toContain("evil.test/data");
    }
  });

  it("does not leak response body in error", async () => {
    const body = "SECRET_BODY_CONTENT";
    const fetchMock = vi.fn(async () =>
      ({
        status: 500,
        ok: false,
        headers: { get: () => null },
        body: null,
        text: async () => body,
      }) as unknown as Response,
    );
    try {
      await fetchSheetCsv(ref, { fetch: fetchMock as unknown as typeof fetch });
      expect.unreachable("should throw");
    } catch (e) {
      expect((e as Error).message).not.toContain(body);
    }
  });

  it("succeeds with valid csv within limit", async () => {
    const csv = "a,b\n1,2";
    const fetchMock = vi.fn(async () =>
      ({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: null,
        text: async () => csv,
      }) as unknown as Response,
    );
    await expect(fetchSheetCsv(ref, { fetch: fetchMock as unknown as typeof fetch })).resolves.toBe(csv);
  });

  it("validates redirect host equals docs.google.com", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      // first call redirects to docs.google.com (allowed), second returns csv
      if (fetchMock.mock.calls.length === 1) {
        return {
          status: 302,
          ok: false,
          headers: { get: (n: string) => (n.toLowerCase() === "location" ? "https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=0" : null) },
          body: null,
          text: async () => "",
        } as unknown as Response;
      }
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: null,
        text: async () => "ok",
      } as unknown as Response;
    });
    // This should succeed (redirect to allowed host)
    await expect(fetchSheetCsv(ref, { fetch: fetchMock as unknown as typeof fetch })).resolves.toBe("ok");
  });

  it("enforces max 3 redirects", async () => {
    const fetchMock = vi.fn(async () =>
      ({
        status: 302,
        ok: false,
        headers: { get: (n: string) => (n.toLowerCase() === "location" ? "https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=1" : null) },
        body: null,
        text: async () => "",
      }) as unknown as Response,
    );
    await expect(fetchSheetCsv(ref, { fetch: fetchMock as unknown as typeof fetch })).rejects.toThrow(/redirect/);
  });
});
