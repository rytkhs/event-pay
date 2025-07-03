/**
 * Jest Environment Variables Setup
 * テスト実行時に.env.localファイルから環境変数を読み込む
 */

import path from "path";
import dotenv from "dotenv";

// .env.localファイルを読み込み
const localEnvPath = path.resolve(process.cwd(), ".env.local");
dotenv.config({ path: localEnvPath });

// テスト環境であることを明示
process.env.NODE_ENV = "test";

console.log("🧪 Jest Test Environment Variables Loaded from .env.local");
console.log(
  "NEXT_PUBLIC_SUPABASE_URL:",
  process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 50) + "..."
);
console.log("UPSTASH_REDIS_REST_URL:", process.env.UPSTASH_REDIS_REST_URL ? "SET" : "NOT SET");
