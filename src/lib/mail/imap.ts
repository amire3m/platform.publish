import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getMailEnv, getMailPassword, mailAddress, type MailAccount } from "./config";

export interface MailMessage {
  id: string;
  uid: number;
  account: MailAccount;
  from: { address: string; name?: string };
  to?: string;
  subject: string;
  date: string; // ISO string
  text?: string;
  html?: string;
  snippet?: string;
  seen: boolean;
}

export async function fetchMessages(account: MailAccount, limit = 20): Promise<MailMessage[]> {
  const pass = getMailPassword(account);
  if (!pass) {
    // No credentials configured — return empty (demo mode). In production add MAIL_INFO_PASS etc to /opt/emro/.env
    return [];
  }
  const env = getMailEnv();
  const client = new ImapFlow({
    host: env.imapHost,
    port: env.imapPort,
    secure: env.imapPort === 993,
    auth: {
      user: mailAddress(account),
      pass,
    },
    logger: false,
    // tolerate self-signed if using bare IP fallback
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (err) {
    // connection failure — return empty with log, don't crash API
    console.error("[mail/imap] connect failed", err);
    return [];
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = client.mailbox as unknown as { exists?: number } | false;
      const total = (box && typeof box !== "boolean" ? box.exists ?? 0 : 0);
      if (total === 0) return [];
      const start = Math.max(1, total - limit + 1);
      const range = `${start}:*`;
      const messages: MailMessage[] = [];
      // fetch envelope + bodySource to parse with mailparser
      for await (const msg of client.fetch(range, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: true,
      } as never)) {
        try {
          const parsed = msg.source ? await simpleParser(msg.source as Buffer) : null;
          const envFrom = msg.envelope?.from?.[0];
          const fromAddr = envFrom?.address ?? parsed?.from?.value?.[0]?.address ?? "unknown";
          const fromName = envFrom?.name ?? parsed?.from?.value?.[0]?.name ?? undefined;
          const subject = (msg.envelope?.subject as string) ?? parsed?.subject ?? "(بدون موضوع)";
          const dateVal = msg.envelope?.date ?? parsed?.date ?? new Date();
          const dateIso = dateVal instanceof Date ? dateVal.toISOString() : new Date(dateVal as string).toISOString();
          const text = parsed?.text ?? undefined;
          const html = parsed?.html ? (typeof parsed.html === "string" ? parsed.html : String(parsed.html)) : undefined;
          messages.push({
            id: String((msg as unknown as { uid: number }).uid ?? msg.seq ?? messages.length),
            uid: (msg as unknown as { uid: number }).uid ?? 0,
            account,
            from: { address: fromAddr, name: fromName },
            to: mailAddress(account),
            subject,
            date: dateIso,
            text,
            html,
            snippet: text ? text.slice(0, 200) : parsed?.textAsHtml?.slice(0, 200) ?? subject.slice(0, 120),
            seen: Array.isArray(msg.flags) ? (msg.flags as unknown as string[]).includes("\\Seen") : false,
          });
        } catch (inner) {
          console.error("[mail/imap] parse failed", inner);
        }
      }
      // newest first
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return messages;
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}
