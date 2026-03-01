// Supabase認証Cookie設定
export const SUPABASE_COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;
