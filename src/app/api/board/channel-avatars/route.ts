import { google } from "googleapis";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonOk, requireUser } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { resolveChannelAccountIdDb } from "@/lib/channel-accounts";
import { BOARD_CHANNELS } from "@/lib/board/channels";
import { matchBoardChannel } from "@/lib/board/avatar-match";

async function fetchAvatar(accountId: string): Promise<{ url: string | null; title: string | null }> {
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

/** Real YouTube channel avatars for the board report (falls back to monogram when unavailable). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const channels = BOARD_CHANNELS.map((c) => ({ id: c.id, nameFa: c.nameFa }));
  const avatars: Record<string, { url: string | null; title: string | null }> = {};
  for (const ch of BOARD_CHANNELS) avatars[ch.id] = { url: null, title: null };

  // 1) Explicit channel linkage first.
  const linked = new Set<string>();
  for (const ch of BOARD_CHANNELS) {
    try {
      const accountId = await resolveChannelAccountIdDb(ch.id, "youtube");
      if (accountId) {
        avatars[ch.id] = await fetchAvatar(accountId);
        linked.add(ch.id);
      }
    } catch {
      // keep null → fallback below
    }
  }

  // 2) Display-name fallback for channels without linkage (real accounts, real avatars).
  const remaining = BOARD_CHANNELS.filter((c) => !linked.has(c.id));
  if (remaining.length > 0) {
    try {
      const accounts = await db.select().from(socialAccounts);
      for (const account of accounts) {
        if ((account as { platform?: string }).platform !== "youtube") continue;
        const name = (account as unknown as { displayName?: string | null }).displayName ?? "";
        const matched = matchBoardChannel(name, channels);
        if (matched && !linked.has(matched)) {
          avatars[matched] = await fetchAvatar(account.id);
          linked.add(matched);
        }
      }
    } catch {
      // keep nulls → monogram fallback
    }
  }
  return jsonOk({ avatars });
}
