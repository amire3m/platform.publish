import { getChannelLabelFa } from "@/lib/channels";
import { PRODUCT_TYPE_LABELS_FA, contentStatusPresentation } from "@/lib/content-room/presentation";

export interface InlineSearchProduct {
  id: string;
  title: string;
  productType: string;
  channel: string;
  status: string;
  partsCount: number;
}

export interface InlineArticleResult {
  type: "article";
  id: string;
  title: string;
  description: string;
  input_message_content: { message_text: string; parse_mode: "HTML" };
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Builds Telegram inline-query article results for products.
 * Pure function — easy to unit test; the webhook only calls it with DB rows.
 */
export function buildInlineResults(products: readonly InlineSearchProduct[], baseUrl: string | null): InlineArticleResult[] {
  const base = (baseUrl ?? "").replace(/\/$/, "");
  return products.map((p) => {
    const typeFa = PRODUCT_TYPE_LABELS_FA[p.productType] ?? p.productType;
    const channelFa = getChannelLabelFa(p.channel);
    const statusFa = contentStatusPresentation(p.status as never).label;
    const description = `${typeFa} • ${channelFa} • ${statusFa} • ${p.partsCount} قسمت`;
    const url = base ? `${base}/content-room/${p.id}` : null;
    const messageText = url
      ? `<b>${escapeHtml(p.title)}</b>\n${escapeHtml(description)}\n🔗 <a href="${url}">مشاهده در اتاق محتوا</a>`
      : `<b>${escapeHtml(p.title)}</b>\n${escapeHtml(description)}`;
    const result: InlineArticleResult = {
      type: "article",
      id: p.id,
      title: p.title,
      description,
      input_message_content: { message_text: messageText, parse_mode: "HTML" },
    };
    if (url) {
      result.reply_markup = { inline_keyboard: [[{ text: "مشاهده در اتاق محتوا", url }]] };
    }
    return result;
  });
}
