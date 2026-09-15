import { google } from "googleapis";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonOk, requireUser } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { resolveChannelAccountIdDb } from "@/lib/channel-accounts";
import { BOARD_CHANNELS } from "@/lib/board/channels";

/** Real YouTube channel avatars for the board report (falls back to monogram when unavailable). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const avatars: Record<string, { url: string | null; title: string | null }> = {};
  for (const ch of BOARD_CHANNELS) {
    let url: string | null = null;
    let title: string | null = null;
    try {
      const accountId = await resolveChannelAccountIdDb(ch.id, "youtube");
      if (accountId) {
        const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1);
        if (account?.credentialRef) {
          const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
          if (cred) {
            const tokens = JSON.parse(decryptSecret(cred.encryptedPayload));
            const auth = getGoogleOAuthClient();
            auth.setCredentials(tokens);
            const youtube = google.youtube({ version: "v3", auth });
            const res = await youtube.channels.list({ part: ["snippet"], mine: true });
            const snippet = res.data.items?.[0]?.snippet;
            url = snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? null;
            title = snippet?.title ?? null;
          }
        }
      }
    } catch {
      // keep null → monogram fallback
    }
    avatars[ch.id] = { url, title };
  }
  return jsonOk({ avatars });
}
