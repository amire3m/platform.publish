import { jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { fetchMessages } from "@/lib/mail/imap";
import type { MailAccount } from "@/lib/mail/config";

export async function GET(request: Request) {
  const { user, response } = await requirePermission("view_mail");
  if (!user) return response!;

  const url = new URL(request.url);
  const accountParam = (url.searchParams.get("account") ?? "info") as string;
  const account: MailAccount = accountParam === "support" ? "support" : "info";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

  try {
    const messages = await fetchMessages(account, limit);
    return jsonOk({ account, messages });
  } catch (e) {
    return jsonInternalError(e, "api/mail/messages");
  }
}
