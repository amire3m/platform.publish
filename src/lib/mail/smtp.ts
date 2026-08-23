import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { getMailEnv, getMailPassword, mailAddress, type MailAccount } from "./config";

export interface SendMailInput {
  fromAccount: MailAccount;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const pass = getMailPassword(input.fromAccount);
  if (!pass) throw new Error("MAIL credentials not configured. Set MAIL_INFO_PASS / MAIL_SUPPORT_PASS in /opt/emro/.env");
  const env = getMailEnv();
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: mailAddress(input.fromAccount),
      pass,
    },
    tls: { rejectUnauthorized: false },
    // allow localhost fallback without TLS
    requireTLS: false,
  });

  const info = await transporter.sendMail({
    from: mailAddress(input.fromAccount),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  // Try to save copy to Sent via IMAP APPEND (best-effort)
  try {
    const imapEnv = getMailEnv();
    const client = new ImapFlow({
      host: imapEnv.imapHost,
      port: imapEnv.imapPort,
      secure: imapEnv.imapPort === 993,
      auth: { user: mailAddress(input.fromAccount), pass },
      logger: false,
      tls: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      // Build minimal RFC822 message for Sent folder
      const raw = [
        `From: ${mailAddress(input.fromAccount)}`,
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${info.messageId ?? `<${Date.now()}@${mailAddress(input.fromAccount)}>`}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        input.text ?? input.html ?? "",
      ].join("\r\n");
      // Ensure Sent mailbox exists then append
      try {
        await client.mailboxOpen("Sent");
      } catch {
        try {
          await client.mailboxCreate("Sent");
        } catch {
          // ignore
        }
      }
      await client.append("Sent", raw, ["\\Seen"]);
    } finally {
      await client.logout().catch(() => {});
    }
  } catch (e) {
    console.warn("[mail/smtp] save to Sent failed (non-fatal)", e);
  }

  return { messageId: (info as unknown as { messageId: string }).messageId ?? "" };
}
