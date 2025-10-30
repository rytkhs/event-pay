import { Noto_Sans_JP } from "next/font/google";
import localFont from "next/font/local";
export const dynamic = "force-dynamic";
import Script from "next/script";

import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";

import "./globals.css";
import "./(marketing)/lp.css";

import { ToastProvider } from "@core/contexts/toast-context";

import { FooterWrapper } from "@components/layout/FooterWrapper";
import { HeaderWrapper } from "@components/layout/HeaderWrapper";

import { Toaster } from "@/components/ui/toast";
import { Tooltip as TooltipProvider } from "@/components/ui/tooltip";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
  weight: ["100", "300", "400", "500", "700", "900"],
});

// 環境に応じたベースURLを取得
const getBaseUrl = () => {
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://minnano-shukin.com"
    );
  }
  return "http://localhost:3000";
};

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getBaseUrl()),
    title: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
    description: "参加の確認から集金まで、リンクの共有だけで完了できる新しいサービスです。",
    keywords: "イベント管理, 出欠管理, 集金, コミュニティ, オンライン決済, みんなの集金",
    openGraph: {
      title: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
      description: "参加の確認から集金まで、リンクの共有だけで完了できる新しいサービスです。",
      type: "website",
      images: [
        {
          url: "/og/homepage.png",
          width: 1200,
          height: 630,
          alt: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
        },
      ],
    },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
        { url: "/favicon.ico", sizes: "48x48" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
      other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#24a6b5" }],
    },
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        {/* Google tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-5KCSZCX4JL"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-5KCSZCX4JL');
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.className} antialiased`}
        suppressHydrationWarning={true}
      >
        <TooltipProvider>
          <ToastProvider ToasterComponent={Toaster}>
            <HeaderWrapper />
            {children}
            <FooterWrapper />
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
