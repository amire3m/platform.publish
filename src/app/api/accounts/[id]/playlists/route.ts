import { eq } from "drizzle-orm";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { canAccessAccount } from "@/lib/permissions";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

interface PlaylistItem {
  id: string;
  title: string;
  itemCount: number | null;
}

// Simple in-memory cache per account (10 min)
const cache = new Map<string, { at: number; items: PlaylistItem[] }>();
const TTL_MS = 10 * 60 * 1000;

// GET /api/accounts/:id/playlists — real YouTube playlists for the picker
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;
  if (!canAccessAccount(user, id)) {
    return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
  }

  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!account) return jsonError("حساب یافت نشد.", 404, "NOT_FOUND");
  if (account.platform !== "youtube") return jsonError("فقط حساب یوتیوب پلی‌لیست دارد.", 400, "INVALID");

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return jsonOk({ playlists: hit.items, cached: true });

  if (!account.credentialRef) return jsonOk({ playlists: [], cached: false });
  const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
  if (!cred) return jsonOk({ playlists: [], cached: false });

  try {
    const payload = JSON.parse(decryptSecret(cred.encryptedPayload)) as Record<string, unknown>;
    const oauth2Client = getGoogleOAuthClient();
    oauth2Client.setCredentials(payload);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const res = await youtube.playlists.list({ part: ["snippet", "contentDetails"], mine: true, maxResults: 50 });
    const items: PlaylistItem[] = (res.data.items ?? []).map((p) => ({
      id: p.id ?? "",
      title: p.snippet?.title ?? "بدون عنوان",
      itemCount: p.contentDetails?.itemCount ?? null,
    })).filter((p) => p.id);
    cache.set(id, { at: Date.now(), items });
    return jsonOk({ playlists: items, cached: false });
  } catch (e) {
    return jsonError("خواندن پلی‌لیست‌ها ناموفق بود. می‌توانید ID دستی وارد کنید.", 502, "PLAYLIST_FETCH_FAILED");
  }
}
