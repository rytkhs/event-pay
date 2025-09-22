import { createClient } from "@core/supabase/server";

import { GlobalHeader } from "./GlobalHeader";

/**
 * ヘッダーラッパーコンポーネント
 *
 * Server Componentとして認証状態を取得し、
 * 適切なGlobalHeaderを表示します。
 */
export async function HeaderWrapper() {
  // 認証状態を取得
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // エラーがあっても未認証として扱う
  const currentUser = error ? null : user;

  return <GlobalHeader user={currentUser} />;
}
