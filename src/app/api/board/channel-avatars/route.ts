import { jsonOk, requireUser } from "@/lib/api-helpers";
import { BOARD_CHANNELS } from "@/lib/board/channels";
import { fetchBoardChannelAvatar, resolveBoardChannelAccountId } from "@/lib/board/server-avatars";

/** Real YouTube channel avatars for the board report (falls back to monogram when unavailable). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const avatars: Record<string, { url: string | null; title: string | null }> = {};
  for (const ch of BOARD_CHANNELS) {
    const accountId = await resolveBoardChannelAccountId(ch.id);
    avatars[ch.id] = accountId ? await fetchBoardChannelAvatar(accountId) : { url: null, title: null };
  }
  return jsonOk({ avatars });
}
