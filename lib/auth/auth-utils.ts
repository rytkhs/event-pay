import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  // テスト環境での認証状態シミュレーション
  if (process.env.NODE_ENV === "test" && process.env.TEST_USER_ID) {
    return {
      id: process.env.TEST_USER_ID,
      email: process.env.TEST_USER_EMAIL || "test@example.com",
      user_metadata: {},
      app_metadata: {},
    };
  }

  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}
