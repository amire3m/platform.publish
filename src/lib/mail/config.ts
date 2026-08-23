export type MailAccount = "info" | "support";
export const MAIL_DOMAIN = "litecombomovie.ir";
export const MAIL_ACCOUNTS: MailAccount[] = ["info", "support"];

export function getMailEnv() {
  return {
    imapHost: process.env.MAIL_IMAP_HOST || "mail.litecombomovie.ir",
    imapPort: Number(process.env.MAIL_IMAP_PORT || 993),
    smtpHost: process.env.MAIL_SMTP_HOST || "mail.litecombomovie.ir",
    smtpPort: Number(process.env.MAIL_SMTP_PORT || 587),
    // secure flag derived from port: 993 TLS, 587 STARTTLS
  };
}

export function mailAddress(account: MailAccount): string {
  return `${account}@${MAIL_DOMAIN}`;
}

export function getMailPassword(account: MailAccount): string | null {
  // Primary: env vars MAIL_INFO_PASS / MAIL_SUPPORT_PASS
  // Also support generic MAIL_PASS fallback for dev
  if (account === "info") {
    if (process.env.MAIL_INFO_PASS) return process.env.MAIL_INFO_PASS;
  }
  if (account === "support") {
    if (process.env.MAIL_SUPPORT_PASS) return process.env.MAIL_SUPPORT_PASS;
  }
  // fallback: check if both missing then null
  return null;
}
