import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TemplateEditor } from "@/components/workflow/TemplateEditor";

export default function WorkflowTemplatesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <Link href="/workflow" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به اتاق انتشار
      </Link>
      <div>
        <h1 className="text-xl font-bold text-tg-text">مدیریت الگوها</h1>
        <p className="text-sm text-tg-secondary">الگوها را ایجاد، مرتب، ویرایش و آرشیو کنید. آرشیو الگوی دارای نمونه نیازمند تأیید است.</p>
      </div>
      <TemplateEditor />
    </div>
  );
}
