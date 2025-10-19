import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // 認証状態チェック
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?redirectTo=/settings");
  }

  // 設定メニューページはlayout.tsxで表示される
  // このコンポーネントは空の要素を返す（実際のコンテンツはlayoutで処理）
  return null;
}
