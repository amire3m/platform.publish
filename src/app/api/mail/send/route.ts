import { z } from "zod";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { sendMail } from "@/lib/mail/smtp";

const schema = z.object({
  from: z.enum(["info", "support"]),
  to: z.string().email("آدرس ایمیل مقصد نامعتبر است"),
  subject: z.string().min(1, "موضوع الزامی است").max(500),
  text: z.string().optional(),
  html: z.string().optional(),
}).refine((d) => (d.text && d.text.trim().length > 0) || (d.html && d.html.trim().length > 0), {
  message: "متن پیام الزامی است",
  path: ["text"],
});

export async function POST(request: Request) {
  const { user, response } = await requirePermission("manage_mail");
  if (!user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است", 422, "VALIDATION_ERROR");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر", 422, "VALIDATION_ERROR");
  }

  try {
    const result = await sendMail({
      fromAccount: parsed.data.from,
      to: parsed.data.to,
      subject: parsed.data.subject,
      text: parsed.data.text,
      html: parsed.data.html,
    });
    return jsonOk({ messageId: result.messageId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا در ارسال ایمیل";
    const status = msg.includes("credentials") ? 503 : 500;
    return jsonError(msg, status);
  }
}
