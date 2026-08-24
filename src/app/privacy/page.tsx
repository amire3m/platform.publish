import type { Metadata } from "next";
import { DocumentSection, PublicDocument } from "@/components/PublicDocument";

export const metadata: Metadata = {
  title: "سیاست حریم خصوصی",
  description: "سیاست حریم خصوصی Publish Platform Emro و نحوه استفاده از داده‌های Google و YouTube.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicDocument
      title="سیاست حریم خصوصی | Privacy Policy"
      subtitle="تاریخ اجرا: ۳ شهریور ۱۴۰۵ (25 August 2026). این سیاست نحوه جمع‌آوری، استفاده، نگهداری و حذف اطلاعات در Publish Platform Emro را توضیح می‌دهد."
    >
      <DocumentSection title="معرفی و مسئول پردازش">
        <p>
          Publish Platform Emro سامانه داخلی مدیریت و انتشار محتوای موسسه امام روح‌الله است. این سامانه برای اتصال حساب‌های YouTube و Instagram، زمان‌بندی و انتشار محتوا و مشاهده آمار رسمی آن‌ها استفاده می‌شود. مسئول این سرویس موسسه امام روح‌الله است و پرسش‌های حریم خصوصی از طریق <a className="font-semibold text-[#881337] hover:underline" href="mailto:amirandali.teams@gmail.com">amirandali.teams@gmail.com</a> پاسخ داده می‌شوند.
        </p>
      </DocumentSection>

      <DocumentSection title="اطلاعاتی که دریافت می‌کنیم">
        <ul className="list-disc space-y-2 pe-5">
          <li>اطلاعات پایه حساب Google/YouTube شامل شناسه و نام کانال و تصویر نمایه.</li>
          <li>فراداده ویدئوها و کانال و آمار فقط‌خواندنی مانند بازدید، پسند، نظر، مدت تماشا و تعداد مشترکان.</li>
          <li>مجوز OAuth و توکن‌های لازم برای اتصال حساب و انجام عملیات مجاز.</li>
          <li>فایل، عنوان، توضیحات، برچسب‌ها، تصویر بندانگشتی و زمان انتشار که کاربر مجاز برای انتشار ارسال می‌کند.</li>
          <li>گزارش‌های امنیتی و ممیزی شامل زمان عملیات، کاربر سامانه و نتیجه عملیات.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="دسترسی‌های Google و هدف استفاده">
        <p>سامانه فقط دسترسی‌های زیر را درخواست می‌کند:</p>
        <ul className="list-disc space-y-2 pe-5" dir="ltr">
          <li><code>youtube.upload</code>: uploading videos and thumbnails selected by an authorized user.</li>
          <li><code>youtube.readonly</code>: reading channel identity and video metadata for account management.</li>
          <li><code>yt-analytics.readonly</code>: reading channel and video performance metrics for internal reports.</li>
        </ul>
        <p>داده‌های Google فقط برای ارائه قابلیت‌هایی استفاده می‌شوند که کاربر در همین سامانه درخواست کرده است؛ از آن‌ها برای تبلیغات، پروفایل‌سازی خارج از سرویس یا تصمیم‌گیری اعتباری استفاده نمی‌شود.</p>
      </DocumentSection>

      <DocumentSection title="اشتراک‌گذاری و فروش اطلاعات">
        <p>اطلاعات شخصی یا داده‌های Google فروخته نمی‌شوند. این اطلاعات برای تبلیغات یا بازاریابی به اشخاص ثالث منتقل نمی‌شوند. دسترسی فقط برای کاربران مجاز موسسه، زیرساخت میزبانی و پایگاه داده لازم برای اجرای سرویس، یا در صورت الزام قانونی فراهم می‌شود. دسترسی انسانی به داده‌ها فقط برای رفع اشکال، امنیت، اجرای درخواست کاربر یا رعایت قانون و با حداقل دامنه لازم انجام می‌شود.</p>
      </DocumentSection>

      <DocumentSection title="Google API Services User Data Policy" dir="ltr">
        <p>
          Publish Platform Emro&apos;s use and transfer of information received from Google APIs will adhere to the <a className="font-semibold text-[#881337] hover:underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
        </p>
        <p>Google user data is used only to provide or improve the user-facing account connection, publishing, scheduling, and analytics features described on this page. It is not used for advertising, is not sold, and is not transferred for unrelated purposes.</p>
      </DocumentSection>

      <DocumentSection title="نگهداری و امنیت">
        <p>ارتباطات عمومی از HTTPS استفاده می‌کنند. توکن‌های OAuth به‌صورت رمزگذاری‌شده در پایگاه داده سمت سرور نگهداری می‌شوند، در مرورگر یا Telegram ذخیره نمی‌شوند و دسترسی به آن‌ها با نقش‌های سامانه محدود است. داده‌های تحلیلی تا زمانی که حساب سازمانی برای گزارش و سوابق عملیاتی لازم باشد نگهداری می‌شوند.</p>
      </DocumentSection>

      <DocumentSection title="قطع دسترسی و حذف داده">
        <p>مدیر مجاز می‌تواند از صفحه «کانال‌ها و پیج‌ها» حساب را قطع کند. با قطع حساب، اعتبارنامه OAuth ذخیره‌شده حذف و استفاده بعدی سامانه از آن متوقف می‌شود. صاحب حساب همچنین می‌تواند دسترسی را از صفحه <a className="font-semibold text-[#881337] hover:underline" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Google Account Connections</a> لغو کند.</p>
        <p>برای حذف داده‌های حساب، آمار ذخیره‌شده یا سوابق مرتبط، درخواست خود را از ایمیل متصل به سازمان به <a className="font-semibold text-[#881337] hover:underline" href="mailto:amirandali.teams@gmail.com?subject=Emro%20Data%20Deletion%20Request">amirandali.teams@gmail.com</a> ارسال کنید. درخواست معتبر حداکثر ظرف ۳۰ روز بررسی و اجرا می‌شود، مگر نگهداری بخشی از سوابق به موجب قانون یا امنیت الزامی باشد.</p>
      </DocumentSection>

      <DocumentSection title="کوکی‌ها، کودکان و تغییرات سیاست">
        <p>سامانه برای ورود کاربران مجاز از کوکی نشست امن استفاده می‌کند و کوکی تبلیغاتی ندارد. این سرویس برای کودکان یا استفاده عمومی طراحی نشده است. تغییرات مهم این سیاست در همین URL با تاریخ اجرای جدید منتشر می‌شوند.</p>
      </DocumentSection>

      <DocumentSection title="English summary" dir="ltr">
        <p>Publish Platform Emro is operated by the Imam Ruhollah Institute for authorized organizational users. The service accesses Google/YouTube account identity, video metadata, upload capability, and read-only analytics solely to connect accounts, publish requested content, and display internal reports. OAuth credentials are encrypted at rest. Google user data is not sold, used for advertising, or shared for unrelated purposes. Users may disconnect an account in the application, revoke access in their Google Account, or request deletion at amirandali.teams@gmail.com.</p>
      </DocumentSection>
    </PublicDocument>
  );
}
