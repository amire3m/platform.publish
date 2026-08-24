import { describe, expect, it } from "vitest";
import {
  auditActionLabelFa,
  deliverableKindLabelFa,
  entityTypeLabelFa,
  fieldLabelFa,
  notificationEventLabelFa,
  oauthErrorMessageFa,
  permissionLabelFa,
  platformLabelFa,
  roleLabelFa,
  sourceLabelFa,
  statusLabelFa,
  workflowActionLabelFa,
  workflowNextActionLabelFa,
} from "./presentation-fa";

describe("Persian presentation mappings", () => {
  it.each([
    [platformLabelFa, "youtube", "YouTube"],
    [platformLabelFa, "instagram", "Instagram"],
    [platformLabelFa, "telegram", "Telegram"],
    [roleLabelFa, "manager", "مدیر"],
    [permissionLabelFa, "manage_programs", "مدیریت برنامه‌ها"],
    [statusLabelFa, "ready_for_review", "آماده بازبینی"],
    [statusLabelFa, "ready_to_send", "آماده ارسال"],
    [workflowNextActionLabelFa, "overdue", "رسیدگی به خروجی‌های معوق"],
    [workflowActionLabelFa, "request_changes", "درخواست اصلاح"],
    [deliverableKindLabelFa, "youtube_full", "ویدئوی کامل YouTube"],
    [deliverableKindLabelFa, "image", "تصویر"],
    [notificationEventLabelFa, "assignee_changed", "تغییر مسئول خروجی"],
    [notificationEventLabelFa, "overdue_daily", "یادآوری روزانه تأخیر"],
    [auditActionLabelFa, "account_connected_oauth", "اتصال حساب با OAuth"],
    [entityTypeLabelFa, "workflow_deliverable", "خروجی گردش کار"],
    [sourceLabelFa, "sheet_import", "ورود از شیت"],
    [fieldLabelFa, "assigneeUserId", "مسئول"],
  ])("maps %s to Persian", (present, value, expected) => {
    expect(present(value)).toBe(expected);
  });

  it.each([
    platformLabelFa,
    roleLabelFa,
    permissionLabelFa,
    statusLabelFa,
    workflowNextActionLabelFa,
    workflowActionLabelFa,
    deliverableKindLabelFa,
    notificationEventLabelFa,
    auditActionLabelFa,
    entityTypeLabelFa,
    sourceLabelFa,
    fieldLabelFa,
  ])("never exposes an unknown technical identifier", (present) => {
    expect(present("internal_secret_code")).toBe("مورد ناشناخته");
  });

  it("presents only safe OAuth callback errors", () => {
    expect(oauthErrorMessageFa("missing_code")).toBe("پاسخ اتصال ناقص بود. دوباره اتصال حساب را آغاز کنید.");
    expect(oauthErrorMessageFa("oauth_failed")).toBe("اتصال حساب انجام نشد. دوباره تلاش کنید.");
    expect(oauthErrorMessageFa("instagram_code_exchange: provider secret")).toBe("اتصال حساب انجام نشد. دوباره تلاش کنید.");
  });
});
