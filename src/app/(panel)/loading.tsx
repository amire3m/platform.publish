"use client";

import { useEffect, useState } from "react";
import { Button, Skeleton } from "@/components/ui";

// Shown during client-side navigation while the RSC stream resolves. If the
// stream stalls (no timeout exists in Next for this), the page would hang
// forever — after 25s offer an explicit recovery instead.
export default function PanelLoading() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), 25000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6" dir="rtl" role="status" aria-label="در حال بارگذاری">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
      {stuck && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            بارگذاری بیش از حد طول کشید. اتصال شما کند است یا بخشی از صفحه نرسید.
          </p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="mt-3 min-h-[44px]">
            تلاش دوباره
          </Button>
        </div>
      )}
    </div>
  );
}
