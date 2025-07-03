import { createSupabaseServerClient } from "@/lib/supabase/server";

export class LogoutService {
  static async logout() {
    const supabase = createSupabaseServerClient();

    // セッション情報を取得してからログアウト
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }

    // セッションキャッシュを無効化
    if (userId) {
      const { AuthHandler } = await import("@/lib/middleware/auth-handler");
      AuthHandler.invalidateSession(userId);
    }

    return {
      success: true,
      message: "ログアウトに成功しました",
    };
  }
}
