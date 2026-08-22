import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProgramWizard } from "@/components/workflow/ProgramWizard";

export default function WorkflowNewPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <Link href="/workflow" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به اتاق انتشار
      </Link>
      <div>
        <h1 className="text-xl font-bold text-tg-text">ایجاد برنامه</h1>
        <p className="text-sm text-tg-secondary">الگو یا برنامه خالی را انتخاب کنید، مشخصات و خروجی‌ها را مرور و ویرایش کنید، سپس در مرحله مرور ذخیره را انجام دهید.</p>
      </div>
      <ProgramWizard />
    </div>
  );
}
