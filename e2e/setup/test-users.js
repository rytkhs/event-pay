/**
 * E2Eテスト用のユーザーセットアップスクリプト
 * テスト実行前にテスト用ユーザーを作成します
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseServiceKey =
  "SUPABASE_SERVICE_ROLE_KEY_REDACTED";

async function createTestUsers() {
  console.log("🚀 E2Eテスト用ユーザーの作成を開始します...");

  // 単純にSupabase CLIを使用してユーザーを作成
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const testUsers = [
    {
      email: "test@eventpay.test",
      password: "testpassword123",
      name: "テストユーザー",
    },
    {
      email: "creator@eventpay.test",
      password: "testpassword123",
      name: "イベント作成者",
    },
    {
      email: "participant@eventpay.test",
      password: "testpassword123",
      name: "テスト参加者",
    },
  ];

  for (const user of testUsers) {
    try {
      // 直接SQLでauth.usersテーブルに挿入
      const userId = crypto.randomUUID();
      const sql = `
        INSERT INTO auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at, 
          created_at, updated_at, raw_app_meta_data, raw_user_meta_data
        ) VALUES (
          '${userId}',
          'authenticated',
          'authenticated', 
          '${user.email}',
          '$2a$10$X9VzP6lVP5Q4.F7zX8CYfOnBFPNjT8YwfLnvQtKlWVxfEiLQn/8u6',
          NOW(),
          NOW(),
          NOW(),
          '{"provider": "email", "providers": ["email"]}',
          '{}'
        ) ON CONFLICT (email) DO NOTHING;
        
        INSERT INTO public.users (id, email, name) 
        VALUES ('${userId}', '${user.email}', '${user.name}')
        ON CONFLICT (id) DO UPDATE SET 
          email = EXCLUDED.email,
          name = EXCLUDED.name;
      `;

      const { stdout, stderr } = await execAsync(
        `echo "${sql}" | npx supabase db reset --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --linked=false`
      );

      if (stderr && !stderr.includes("NOTICE")) {
        console.error(`❌ ユーザー ${user.email} の作成に失敗:`, stderr);
      } else {
        console.log(`✓ ユーザー ${user.email} を作成しました`);
      }
    } catch (error) {
      console.error(`❌ 予期しないエラー ${user.email}:`, error.message);
    }
  }

  console.log("🎉 E2Eテスト用ユーザーのセットアップが完了しました");
}

// スクリプトとして実行された場合
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  createTestUsers().catch(console.error);
}

export { createTestUsers };
