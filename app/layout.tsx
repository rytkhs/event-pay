import { Noto_Sans_JP } from "next/font/google";
import { headers } from "next/headers";

import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";

import "./globals.css";

import { getGA4Config } from "@core/analytics/config";
import { ToastProvider } from "@core/contexts/toast-context";
import {
  generateOrganizationSchema,
  generateWebSiteSchema,
  generateSoftwareApplicationSchema,
} from "@core/seo/jsonld-schemas";

import { GlobalErrorListener } from "@components/errors/GlobalErrorListener";
import { JsonLd } from "@components/seo/JsonLd";

import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: "みんなの集金",
    template: "%s | みんなの集金",
  },
  description:
    "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理 & 集金アプリです。いつもの集金を、キャッシュレスにしませんか?",
  openGraph: {
    title: "みんなの集金 - 集金ストレスをゼロに。",
    description:
      "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理 & 集金アプリです。いつもの集金を、キャッシュレスにしませんか?",
    type: "website",
    locale: "ja_JP",
    url: getBaseUrl(),
    siteName: "みんなの集金",
    images: [
      {
        url: "/og/homepage.png",
        width: 1200,
        height: 630,
        alt: "みんなの集金 - 集金ストレスをゼロに。",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "みんなの集金 - 集金ストレスをゼロに。",
    description:
      "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理 & 集金アプリです。いつもの集金を、キャッシュレスにしませんか?",
    images: ["/og/homepage.png"],
    site: "@minnano_shukin",
    creator: "@minnano_shukin",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
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
  const softwareApplicationSchema = generateSoftwareApplicationSchema();

  return (
    <html lang="ja" suppressHydrationWarning={true}>
      <body className={`${notoSansJp.className} antialiased`} suppressHydrationWarning={true}>
        <GlobalErrorListener />
        <JsonLd
          data={[organizationSchema, webSiteSchema, softwareApplicationSchema]}
          nonce={nonce}
        />
        <TooltipProvider>
          <ToastProvider ToasterComponent={Toaster}>{children}</ToastProvider>
        </TooltipProvider>
        {ga4Config.enabled && <GoogleAnalytics gaId={ga4Config.measurementId} nonce={nonce} />}
      </body>
    </html>
  );
}
