import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YouTube EmRo | مدیریت محتوای چندکاناله",
  description: "پلتفرم مدیریت چند کانال یوتیوب و پیج اینستاگرام با مخزن تلگرام",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17212b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-tg-bg font-sans text-tg-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
