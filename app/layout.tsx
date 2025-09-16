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
  title: "みんなの集金 - 出欠も集金も、ひとつのリンクで完了",
  description:
    "参加者は登録不要。主催者は出欠と入金の状況が自動でまとまるから、集計ミスと催促のストレスがぐっと減ります。",
  keywords: "イベント管理, 出欠管理, 集金, 小規模コミュニティ, オンライン決済, みんなの集金",
  openGraph: {
    title: "みんなの集金 - 出欠も集金も、ひとつのリンクで完了",
    description:
      "参加者は登録不要。主催者は出欠と入金の状況が自動でまとまるから、集計ミスと催促のストレスがぐっと減ります。",
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
