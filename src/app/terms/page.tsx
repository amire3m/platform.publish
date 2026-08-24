import type { Metadata } from "next";
import { DocumentSection, PublicDocument } from "@/components/PublicDocument";

export const metadata: Metadata = {
  title: "شرایط استفاده",
  description: "شرایط استفاده از Publish Platform Emro.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PublicDocument
      title="شرایط استفاده | Terms of Service"
      subtitle="تاریخ اجرا: ۳ شهریور ۱۴۰۵ (25 August 2026). استفاده از Publish Platform Emro به معنی پذیرش این شرایط است."
    >
      <DocumentSection title="دامنه سرویس">
        <p>Publish Platform Emro سامانه مدیریت محتوای موسسه امام روح‌الله برای اتصال حساب‌های اجتماعی، آماده‌سازی، زمان‌بندی، انتشار و تحلیل محتوا است. این سرویس عمومی نیست و استفاده از پنل به کاربران مجاز سازمان محدود می‌شود.</p>
      </DocumentSection>

      <DocumentSection title="حساب و دسترسی">
        <ul className="list-disc space-y-2 pe-5">
          <li>کاربر باید مجوز لازم برای اتصال و مدیریت حساب YouTube یا Instagram موردنظر را داشته باشد.</li>
          <li>اشتراک‌گذاری نشست، دورزدن کنترل دسترسی یا استفاده از حساب شخص دیگر ممنوع است.</li>
          <li>کاربر مسئول صحت محتوای ارسالی، مجوزهای مالکیت فکری و رعایت قوانین پلتفرم مقصد است.</li>
          <li>دسترسی کاربر یا حسابی که امنیت یا الزامات سازمان را نقض کند می‌تواند تعلیق یا قطع شود.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="قوانین Google و YouTube">
        <p>استفاده از قابلیت‌های YouTube تابع <a className="font-semibold text-[#881337] hover:underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>، <a className="font-semibold text-[#881337] hover:underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a> و سیاست‌های مرتبط Google API است. کاربر می‌تواند دسترسی سامانه را از <a className="font-semibold text-[#881337] hover:underline" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Google Account Connections</a> لغو کند.</p>
      </DocumentSection>

      <DocumentSection title="محتوا و عملیات انتشار">
        <p>سامانه محتوا را بر اساس اطلاعات، زمان‌بندی و سطح دسترسی تعیین‌شده توسط کاربران مجاز پردازش می‌کند. پیش از انتشار نهایی، کاربر مسئول بررسی عنوان، توضیحات، فایل، تصویر بندانگشتی، وضعیت عمومی یا خصوصی و زمان انتشار است. استفاده برای محتوای غیرقانونی، ناقض حقوق دیگران، فریبنده یا مخرب ممنوع است.</p>
      </DocumentSection>

      <DocumentSection title="دسترس‌پذیری و مسئولیت">
        <p>برای پایداری و امنیت سرویس تلاش معقول انجام می‌شود، اما دسترسی بدون وقفه یا موفقیت همه عملیات اشخاص ثالث تضمین نمی‌شود. محدودیت سهمیه، قطعی یا تغییر APIهای Google، YouTube، Instagram و Telegram ممکن است بر سرویس اثر بگذارد. تا حد مجاز قانون، مسئولیت خسارت غیرمستقیم ناشی از این عوامل پذیرفته نمی‌شود.</p>
      </DocumentSection>

      <DocumentSection title="پایان استفاده و تغییر شرایط">
        <p>کاربر مجاز می‌تواند اتصال حساب اجتماعی را از سامانه قطع کند. موسسه می‌تواند برای امنیت، تخلف، پایان همکاری یا تغییر نیازهای سازمانی دسترسی را متوقف کند. نسخه جدید شرایط با تاریخ اجرای به‌روز در همین URL منتشر می‌شود.</p>
      </DocumentSection>

      <DocumentSection title="تماس">
        <p>برای پرسش درباره این شرایط با <a className="font-semibold text-[#881337] hover:underline" href="mailto:amirandali.teams@gmail.com">amirandali.teams@gmail.com</a> تماس بگیرید.</p>
      </DocumentSection>

      <DocumentSection title="English summary" dir="ltr">
        <p>Publish Platform Emro is an internal content publishing and analytics service operated by the Imam Ruhollah Institute. Only authorized organizational users may access the management panel. Users must have authority over connected social accounts and are responsible for their content and compliance with applicable platform terms. YouTube features are also governed by the YouTube Terms of Service and Google policies. Access may be suspended for security, misuse, or organizational reasons. Contact: amirandali.teams@gmail.com.</p>
      </DocumentSection>
    </PublicDocument>
  );
}
