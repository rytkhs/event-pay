import localFont from "next/font/local";

import type { Metadata } from "next";

import "./globals.css";

import { ToastProvider } from "@core/contexts/toast-context";

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

export const metadata: Metadata = {
  title: "EventPay - 小規模コミュニティ向けイベント出欠管理・集金ツール",
  description:
    "会計担当者の負担を80%削減！小規模コミュニティのイベント出欠管理・集金を簡単・安全・自動化するツールです。",
  keywords: "イベント管理, 出欠管理, 集金, 小規模コミュニティ, オンライン決済, EventPay",
  openGraph: {
    title: "EventPay - 会計担当者の負担を80%削減",
    description: "小規模コミュニティ向けイベント出欠管理・集金ツール",
    type: "website",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <TooltipProvider>
          <ToastProvider ToasterComponent={Toaster}>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
