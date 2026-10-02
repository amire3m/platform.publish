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

const STALE_ASSET_RELOADER = `(function(){var k='emro-stale-reload-at';window.addEventListener('error',function(e){var t=e.target||{};var u=t.src||t.href||'';if(typeof u==='string'&&u.indexOf('/_next/static')>-1){try{var l=+sessionStorage.getItem(k)||0;if(Date.now()-l<30000)return;sessionStorage.setItem(k,String(Date.now()));}catch(x){}location.reload();}},true);if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} suppressHydrationWarning>
      <head>
        {/* Self-healing after redeploys: hashed /_next/static files from an older
            build 404 on tabs holding cached HTML (unstyled/dead page). This inline
            script ships with the HTML itself, so it works even when bundles fail. */}
        <script dangerouslySetInnerHTML={{ __html: STALE_ASSET_RELOADER }} />
      </head>
      <body className="min-h-screen bg-tg-bg font-sans text-tg-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
