import { redirect } from "next/navigation";

import { Metadata } from "next";

import { DemoEntryPage } from "@features/demo";

import { startDemoSession } from "./actions";

export const metadata: Metadata = {
  title: "デモ環境を構築中...",
  robots: "noindex, nofollow, noarchive",
};

export default function StartDemoPage() {
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";
  const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://minnanoshukin.com";

  if (!isDemo) {
    // 本番環境ではアクセス不可
    redirect(productionUrl);
  }

  return <DemoEntryPage startDemoSession={startDemoSession} />;
}
