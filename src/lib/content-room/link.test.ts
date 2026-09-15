import { describe, expect, it } from "vitest";
import { parseTelegramMessageLink } from "./link";

describe("parseTelegramMessageLink", () => {
  it("parses private-group links", () => {
    expect(parseTelegramMessageLink("https://t.me/c/2326782937/2577")).toEqual({ chatId: "2326782937", messageId: "2577" });
    expect(parseTelegramMessageLink("t.me/c/2326782937/2577")).toEqual({ chatId: "2326782937", messageId: "2577" });
    expect(parseTelegramMessageLink("https://t.me/c/2326782937/2577?single")).toEqual({ chatId: "2326782937", messageId: "2577" });
  });

  it("parses private-group topic links", () => {
    expect(parseTelegramMessageLink("https://t.me/c/2326782937/28/2577")).toEqual({ chatId: "2326782937", messageId: "2577" });
  });

  it("parses public-channel links", () => {
    expect(parseTelegramMessageLink("https://t.me/emamyt/2540")).toEqual({ chatId: null, messageId: "2540" });
  });

  it("parses public topic links (real user case)", () => {
    expect(parseTelegramMessageLink("https://t.me/emamyt/28/1081")).toEqual({ chatId: null, messageId: "1081" });
    expect(parseTelegramMessageLink("https://t.me/emamyt/28/1081?single")).toEqual({ chatId: null, messageId: "1081" });
  });

  it("rejects junk", () => {
    expect(parseTelegramMessageLink("https://example.com/x")).toEqual({ chatId: null, messageId: null });
    expect(parseTelegramMessageLink("")).toEqual({ chatId: null, messageId: null });
    expect(parseTelegramMessageLink("https://t.me/emamyt/notanumber")).toEqual({ chatId: null, messageId: null });
    expect(parseTelegramMessageLink("https://t.me/c/2326782937")).toEqual({ chatId: null, messageId: null });
  });
});
