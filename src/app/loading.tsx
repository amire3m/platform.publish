"use client";

import { useEffect, useState } from "react";

// Root-level navigation fallback with the same stuck-detector contract as the
// panel one: never leave the user on an eternal blank/loading state.
export default function RootLoading() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), 25000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-3 text-center" role="status" aria-label="در حال بارگذاری">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-tg-accent border-t-transparent" />
        <p className="text-sm text-tg-secondary">در حال بارگذاری...</p>
        {stuck && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-300">بارگذاری بیش از حد طول کشید.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 min-h-[44px] rounded-lg bg-tg-hover px-4 py-2 text-sm font-medium text-tg-text"
            >
              تلاش دوباره
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
