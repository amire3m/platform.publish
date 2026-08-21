import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ socialAccounts: {} }));

import { handleAccountsRequest, type AccountsRouteDependencies } from "./route";

const accounts = [
  {
    id: "allowed",
    platform: "youtube",
    username: "allowed-channel",
    displayName: "Allowed Channel",
    profileImage: "https://example.com/allowed.jpg",
    active: true,
    externalAccountId: "youtube-allowed",
    credentialRef: "secret-ref-allowed",
    connectionStatus: "connected",
    topicId: "topic-1",
    topicLabel: "Allowed topic",
    topicMessageThreadId: 999,
    lastSyncAt: new Date("2026-08-21T08:00:00.000Z"),
    lastError: null,
    analyticsSyncLockedAt: new Date("2026-08-21T09:00:00.000Z"),
    analyticsSyncLockId: "internal-lock",
    capabilities: { analytics: true },
    encryptedAccessToken: "ciphertext",
  },
  {
    id: "denied",
    platform: "youtube",
    username: "denied-channel",
    displayName: "Denied Channel",
    profileImage: null,
    active: true,
    externalAccountId: "youtube-denied",
    credentialRef: "secret-ref-denied",
    connectionStatus: "error",
    topicId: null,
    topicLabel: null,
    topicMessageThreadId: 1000,
    lastSyncAt: null,
    lastError: "provider operational detail",
    analyticsSyncLockedAt: null,
    analyticsSyncLockId: null,
    capabilities: {},
  },
];

const allowedPublicDto = {
  id: "allowed",
  platform: "youtube",
  username: "allowed-channel",
  displayName: "Allowed Channel",
  profileImage: "https://example.com/allowed.jpg",
  active: true,
  connectionStatus: "connected",
  topicId: "topic-1",
  topicLabel: "Allowed topic",
  lastSyncAt: "2026-08-21T08:00:00.000Z",
  capabilities: { analytics: true },
};

function dependencies(user: { role: string; allowedAccountIds?: string[] | null }): AccountsRouteDependencies {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user, response: null }),
    listAccounts: vi.fn().mockResolvedValue(accounts),
  };
}

describe("GET /api/accounts", () => {
  it("never returns identity or operational fields for accounts outside the user scope", async () => {
    const response = await handleAccountsRequest(dependencies({ role: "analyst", allowedAccountIds: ["allowed"] }));
    const body = await response.json();

    expect(body.data).toEqual([allowedPublicDto]);
    expect(JSON.stringify(body)).not.toContain("youtube-denied");
    expect(JSON.stringify(body)).not.toContain("secret-ref-denied");
    expect(JSON.stringify(body)).not.toContain("provider operational detail");
  });

  it("serializes an explicit public DTO even for an authorized account", async () => {
    const response = await handleAccountsRequest(dependencies({ role: "analyst", allowedAccountIds: ["allowed"] }));
    const body = await response.json();

    expect(Object.keys(body.data[0]).sort()).toEqual(Object.keys(allowedPublicDto).sort());
    expect(JSON.stringify(body)).not.toContain("secret-ref-allowed");
    expect(JSON.stringify(body)).not.toContain("internal-lock");
    expect(JSON.stringify(body)).not.toContain("ciphertext");
    expect(body.data[0]).not.toHaveProperty("topicMessageThreadId");
    expect(body.data[0]).not.toHaveProperty("lastError");
  });

  it.each([
    { role: "owner", allowedAccountIds: ["allowed"] },
    { role: "analyst", allowedAccountIds: [] },
  ])("preserves unrestricted semantics for $role with its configured scope", async (user) => {
    const response = await handleAccountsRequest(dependencies(user));
    const body = await response.json();

    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual(allowedPublicDto);
    expect(body.data[1]).toEqual({
      id: "denied",
      platform: "youtube",
      username: "denied-channel",
      displayName: "Denied Channel",
      profileImage: null,
      active: true,
      connectionStatus: "error",
      topicId: null,
      topicLabel: null,
      lastSyncAt: null,
      capabilities: {},
    });
  });
});
