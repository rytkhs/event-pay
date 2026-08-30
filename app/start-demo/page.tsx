import { redirect } from "next/navigation";

import { Metadata } from "next";

import { DemoEntryPage } from "@features/demo";

import { startDemoSession } from "./actions";

export const metadata: Metadata = {
  title: "デモ環境を構築中...",
  robots: "noindex, nofollow, noarchive",
};

export const dynamic = "force-dynamic";

export default function StartDemoPage() {
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";
  // 未設定でも redirect(undefined) で 500 にしないよう既定の本番URLへ倒す
  const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL ?? "https://minnano-shukin.com";

  if (!isDemo) {
    // 本番環境ではアクセス不可
    redirect(productionUrl);
  }

  return <DemoEntryPage startDemoSession={startDemoSession} />;
}
