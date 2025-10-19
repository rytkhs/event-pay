import { Noto_Sans_JP } from "next/font/google";
import localFont from "next/font/local";
export const dynamic = "force-dynamic";

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

export const metadata: Metadata = {
  title: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
  description:
    "参加者は登録不要。主催者は出欠と入金の状況が自動でまとまるから、集計ミスと催促のストレスがぐっと減ります。",
  keywords: "イベント管理, 出欠管理, 集金, 小規模コミュニティ, オンライン決済, みんなの集金",
  openGraph: {
    title: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
    description:
      "参加者は登録不要。主催者は出欠と入金の状況が自動でまとまるから、集計ミスと催促のストレスがぐっと減ります。",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#24a6b5" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning={true}>
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
