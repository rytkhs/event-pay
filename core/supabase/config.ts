import { getEnv } from "@core/utils/cloudflare-env";

// Supabase認証Cookie設定
export const SUPABASE_COOKIE_CONFIG = {
  httpOnly: true,
  secure: getEnv().NODE_ENV === "production",
} as const;

export const getSupabaseCookieConfig = (_isHttps?: boolean) => SUPABASE_COOKIE_CONFIG;
