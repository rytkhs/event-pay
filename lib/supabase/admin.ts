import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin Client (Service Role)
 * ユーザー管理での補償トランザクション等、管理者権限が必要な操作用
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * ユーザー削除（補償トランザクション用）
 */
export async function deleteUserById(userId: string): Promise<void> {
  const adminClient = createSupabaseAdminClient();

  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }
}

/**
 * ユーザーのpublic.usersレコード存在確認
 */
export async function checkUserProfileExists(userId: string): Promise<boolean> {
  const adminClient = createSupabaseAdminClient();

  const { data, error } = await adminClient.from("users").select("id").eq("id", userId).single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = No rows returned
    throw new Error(`Failed to check user profile: ${error.message}`);
  }

  return !!data;
}
