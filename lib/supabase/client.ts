import { createBrowserClient } from "@supabase/ssr";

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

  return createBrowserClient(supabaseUrl, supabaseKey);
}
