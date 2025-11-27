import { Noto_Sans_JP } from "next/font/google";
import localFont from "next/font/local";
import { headers } from "next/headers";

import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";

import "./globals.css";

import { getGA4Config } from "@core/analytics/config";
import { ToastProvider } from "@core/contexts/toast-context";
import { generateOrganizationSchema, generateWebSiteSchema } from "@core/seo/jsonld-schemas";

import { JsonLd } from "@components/seo/JsonLd";

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

// Noto Sans JPの可変フォント最適化
// weight配列を指定しないことで、可変フォントの全ウェイト範囲を単一ファイルでカバー
const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

// 環境に応じたベースURLを取得
const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: "みんなの集金",
    template: "%s | みんなの集金",
  },
  description: "参加の確認から集金まで、リンクの共有だけで完了できる新しいサービスです。",
  alternates: {
    canonical: "./",
  },
  openGraph: {
    title: "みんなの集金 - 集金ストレスをゼロに",
    description: "参加の確認から集金まで、リンクの共有だけで完了できる新しいサービスです。",
    type: "website",
    locale: "ja_JP",
    images: [
      {
        url: "/og/homepage.png",
        width: 1200,
        height: 630,
        alt: "みんなの集金 - 集金ストレスをゼロに",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "みんなの集金 - 集金ストレスをゼロに",
    description: "参加の確認から集金まで、リンクの共有だけで完了できる新しいサービスです。",
    images: ["/og/homepage.png"],
    site: "@minnano_shukin",
    creator: "@minnano_shukin",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#24a6b5" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  const ga4Config = getGA4Config();
  const nonce = headers().get("x-nonce") ?? undefined;

  // 構造化データ（JSON-LD）を生成
  const organizationSchema = generateOrganizationSchema();
  const webSiteSchema = generateWebSiteSchema();

  return (
    <html lang="ja" suppressHydrationWarning={true}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.className} antialiased`}
        suppressHydrationWarning={true}
      >
        <JsonLd data={[organizationSchema, webSiteSchema]} nonce={nonce} />
        <TooltipProvider>
          <ToastProvider ToasterComponent={Toaster}>{children}</ToastProvider>
        </TooltipProvider>
        {ga4Config.enabled && <GoogleAnalytics gaId={ga4Config.measurementId} nonce={nonce} />}
      </body>
    </html>
  );
}
