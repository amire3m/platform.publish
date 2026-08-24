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
  metadataBase: new URL("https://emamyt.litecombomovie.ir"),
  applicationName: "Publish Platform Emro",
  title: {
    default: "Publish Platform Emro | مدیریت انتشار محتوا",
    template: "%s | Publish Platform Emro",
  },
  description: "سامانه رسمی مدیریت، زمان‌بندی، انتشار و تحلیل محتوای YouTube و Instagram موسسه امام روح‌الله.",
  alternates: { canonical: "/" },
  icons: { icon: "/emro-logo.svg", apple: "/emro-logo-120.png" },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: "Publish Platform Emro",
    title: "Publish Platform Emro",
    description: "سامانه مدیریت انتشار محتوای موسسه امام روح‌الله",
    url: "/",
    images: [{ url: "/emro-logo-512.png", width: 512, height: 512, alt: "Publish Platform Emro" }],
  },
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
