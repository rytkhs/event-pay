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
  if (error || !user) {
    return <GlobalHeader user={null} />;
  }

  // usersテーブルからユーザー情報を取得
  const { data: userProfile, error: profileError } = await supabase
    .from("users")
    .select("id, name, created_at, updated_at")
    .eq("id", user.id)
    .single();

  // プロフィール取得に失敗した場合はemailをフォールバックとして使用
  const currentUser = profileError
    ? { ...user, name: user.email }
    : { ...user, name: userProfile?.name || user.email };

  return <GlobalHeader user={currentUser} />;
}
