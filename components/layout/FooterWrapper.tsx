import { createClient } from "@core/supabase/server";

import { GlobalFooter } from "./GlobalFooter";

/**
 * フッターラッパーコンポーネント
 *
 * サーバーサイドで認証状態を取得してGlobalFooterに渡します。
 * HeaderWrapperと同様のパターンで実装されています。
 */
export async function FooterWrapper(): Promise<JSX.Element> {
  const supabase = createClient();

  // 現在のユーザー情報を取得（エラーが発生しても継続）
  let _user = null;
  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    _user = currentUser;
  } catch (error) {
    // 認証エラーは無視（フッターは表示し続ける）
    console.error("Footer: Auth error (ignored):", error);
  }

  return (
    <GlobalFooter
    // TODO: 将来的にユーザー状態に基づいてvariantを調整する場合はここで設定
    // variant={user ? 'full' : 'marketing'}
    />
  );
}
