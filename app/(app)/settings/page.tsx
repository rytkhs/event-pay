import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "設定",
  description: "コミュニティ、オンライン集金、アカウント情報を管理します",
};

export default async function SettingsPage() {
  // 設定メニューページはlayout.tsxで表示される
  // このコンポーネントは空の要素を返す（実際のコンテンツはlayoutで処理）
  return null;
}
