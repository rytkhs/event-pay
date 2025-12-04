import type { ReactNode } from "react";

import { createClient } from "@core/supabase/server";

// import { GlobalFooter } from "@components/layout/GlobalFooter";
import { GlobalHeader } from "@components/layout/GlobalHeader";

/**
 * アプリケーションレイアウト
 *
 * 認証済みユーザー向けアプリケーション領域のレイアウト。
 * 認証状態を取得してGlobalHeaderに渡します（動的レンダリング）。
 *
 * 使用コンポーネント:
 * - GlobalHeader: variant="app"でアプリヘッダーを表示
 * - GlobalFooter: 静的Server Componentとして実装されたフッター
 *
 * このレイアウトは動的レンダリングされ、ダッシュボード、イベント管理、設定ページなどで使用されます。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // 認証状態を取得（middlewareで認証済みであることが保証されている）
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // usersテーブルからユーザー情報を取得
  const currentUser = user
    ? await supabase
        .from("users")
        .select("id, name, created_at, updated_at")
        .eq("id", user.id)
        .single()
        .then(({ data, error }) =>
          error ? { ...user, name: user.email } : { ...user, name: data?.name || user.email }
        )
    : null;

  return (
    <>
      <GlobalHeader user={currentUser} variant="app" />
      <main>{children}</main>
      {/* <GlobalFooter /> */}
    </>
  );
}
