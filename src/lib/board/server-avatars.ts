import { google } from "googleapis";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { resolveChannelAccountIdDb } from "@/lib/channel-accounts";
import { BOARD_CHANNELS } from "./channels";
import { matchBoardChannel } from "./avatar-match";
import type { BoardChannelId } from "./types";

/** Resolve the YouTube social account for a board channel: explicit linkage first, display-name fallback. */
export async function resolveBoardChannelAccountId(boardId: string): Promise<string | null> {
  try {
    const linked = await resolveChannelAccountIdDb(boardId, "youtube");
    if (linked) return linked;
  } catch {
    // fall through to name matching
  }
  try {
    const channels = BOARD_CHANNELS.map((c) => ({ id: c.id, nameFa: c.nameFa }));
    const accounts = await db.select().from(socialAccounts);
    for (const account of accounts) {
      const row = account as unknown as { id: string; platform?: string; displayName?: string | null };
      if (row.platform !== "youtube") continue;
      if (matchBoardChannel(row.displayName ?? "", channels) === (boardId as BoardChannelId)) return row.id;
    }
  } catch {
    // no match
  }
  return null;
}

/** Fetch the channel's avatar URL + title via its OAuth credentials. Nulls when unavailable. */
export async function fetchBoardChannelAvatar(accountId: string): Promise<{ url: string | null; title: string | null }> {
  try {
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1);
    if (!account?.credentialRef) return { url: null, title: null };
    const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
    if (!cred) return { url: null, title: null };
    const tokens = JSON.parse(decryptSecret(cred.encryptedPayload));
    const auth = getGoogleOAuthClient();
    auth.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth });
    const res = await youtube.channels.list({ part: ["snippet"], mine: true });
    const snippet = res.data.items?.[0]?.snippet;
    return {
      url: snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? null,
      title: snippet?.title ?? null,
    };
  } catch {
    return { url: null, title: null };
  }
}
