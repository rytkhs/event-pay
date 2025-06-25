import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'test') {
      // テスト環境では警告のみ表示してダミークライアントを返す
      console.warn('テスト環境: Supabase環境変数が設定されていません');
      return null as any;
    }
    throw new Error('Supabase環境変数が設定されていません');
  }

  // テスト環境では cookies() が利用できない場合があるため、try-catch で処理
  let cookieStore: any;
  try {
    cookieStore = cookies();
  } catch (error) {
    // テスト環境など、cookies()が利用できない場合のフォールバック
    cookieStore = {
      getAll: () => [],
      set: () => {},
      get: () => undefined,
      delete: () => {},
    };
  }

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            if (process.env.NODE_ENV !== 'test') {
              console.warn('Cookie設定エラー:', error);
            }
          }
        },
      },
    }
  );
}

// Service Role Key を使用するクライアント（Webhook処理等で使用）
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No-op for service role
        },
      },
    }
  );
}
