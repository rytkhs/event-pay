// 統合テスト用の環境変数設定
process.env.NODE_ENV = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY_REDACTED";
process.env.SUPABASE_SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY_REDACTED";