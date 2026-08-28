// -----------------------------------------------------------------------------
// Keyboard builders — glass InlineKeyboard helpers
// -----------------------------------------------------------------------------
// All keyboards respect: max 2 rows × 3 buttons, callback_data format
// `{action}:{id}` (≤64 bytes), Persian labels reused per spec.
// Panel link uses APP_BASE_URL for "🔗 مشاهده در پنل" url button.
// -----------------------------------------------------------------------------

function panelUrl(contentId: string): string {
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/content/${contentId}`;
}

function trim(rows: Array<Array<{ text: string; callback_data?: string; url?: string }>>) {
  return rows.slice(0, 2).map((r) => r.slice(0, 3));
}

export function buildContentKeyboard(
  contentId: string,
  status: string,
  approvalStatus?: string | null,
): { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } {
  const url = panelUrl(contentId);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  const isPendingApproval =
    approvalStatus === "pending" ||
    (approvalStatus == null && ["draft", "uploaded", "in_review", "changes_requested", "pending"].includes(status));

  if (isPendingApproval || ["draft", "uploaded", "in_review", "changes_requested"].includes(status)) {
    rows.push([
      { text: "تأیید ✅", callback_data: `approve:${contentId}` },
      { text: "درخواست اصلاح ✏️", callback_data: `request-changes:${contentId}` },
    ]);
    rows.push([
      { text: "زمان‌بندی 📅", callback_data: `schedule:${contentId}` },
      { text: "انتشار فوری 🚀", callback_data: `publish-now:${contentId}` },
      { text: "🔗 مشاهده در پنل", url },
    ]);
  } else if (status === "approved") {
    rows.push([
      { text: "زمان‌بندی 📅", callback_data: `schedule:${contentId}` },
      { text: "انتشار فوری 🚀", callback_data: `publish-now:${contentId}` },
    ]);
    rows.push([{ text: "🔗 مشاهده در پنل", url }]);
  } else if (status === "scheduled") {
    rows.push([
      { text: "لغو ⏸", callback_data: `cancel:${contentId}` },
      { text: "انتشار فوری 🚀", callback_data: `publish-now:${contentId}` },
    ]);
    rows.push([{ text: "🔗 مشاهده در پنل", url }]);
  } else if (status === "failed") {
    rows.push([
      { text: "تلاش مجدد 🔄", callback_data: `retry:${contentId}` },
      { text: "لغو ⏸", callback_data: `cancel:${contentId}` },
      { text: "درخواست اصلاح ✏️", callback_data: `request-changes:${contentId}` },
    ]);
    rows.push([{ text: "🔗 مشاهده در پنل", url }]);
  } else if (status === "published" || status === "publishing") {
    rows.push([
      { text: "📊 آنالیتیکس", callback_data: `analytics:${contentId}` },
      { text: "🗄️ آرشیو", callback_data: `archive:${contentId}` },
    ]);
    rows.push([{ text: "🔗 مشاهده در پنل", url }]);
  } else {
    rows.push([{ text: "🔗 مشاهده در پنل", url }]);
  }

  return { inline_keyboard: trim(rows) };
}

export function buildPublishSuccessKeyboard(contentId: string): {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
} {
  const url = panelUrl(contentId);
  return {
    inline_keyboard: trim([
      [
        { text: "🔗 مشاهده در پنل", url },
        { text: "📊 آنالیتیکس", callback_data: `analytics:${contentId}` },
      ],
      [{ text: "🗄️ آرشیو", callback_data: `archive:${contentId}` }],
    ]),
  };
}

export function buildPublishErrorKeyboard(contentId: string): {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
} {
  const url = panelUrl(contentId);
  return {
    inline_keyboard: trim([
      [
        { text: "تلاش مجدد 🔄", callback_data: `retry:${contentId}` },
        { text: "لغو ⏸", callback_data: `cancel:${contentId}` },
        { text: "درخواست اصلاح ✏️", callback_data: `request-changes:${contentId}` },
      ],
      [{ text: "🔗 مشاهده در پنل", url }],
    ]),
  };
}

export function buildPrivateNotifyKeyboard(contentId: string, success: boolean): {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
} {
  const url = panelUrl(contentId);
  if (success) {
    return {
      inline_keyboard: trim([
        [
          { text: "🔗 مشاهده در پنل", url },
          { text: "📊 آنالیتیکس", callback_data: `analytics:${contentId}` },
        ],
        [{ text: "🗄️ آرشیو", callback_data: `archive:${contentId}` }],
      ]),
    };
  }
  return buildPublishErrorKeyboard(contentId);
}
