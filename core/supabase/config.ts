import { getEnv } from "@core/utils/cloudflare-env";

// Supabase認証Cookie設定
export const SUPABASE_COOKIE_CONFIG = {
  httpOnly: true,
  secure: (() => {
    const env = getEnv();
    if (env.FORCE_SECURE_COOKIES === "true") {
      return true;
    }
    if (env.FORCE_SECURE_COOKIES === "false" && env.NODE_ENV === "development") {
      return false;
    }
    return (
      env.NODE_ENV === "production" || env.NEXT_PUBLIC_APP_URL?.startsWith("https://") || false
    );
  })(),
  sameSite: "lax" as const,
  domain: (() => {
    const env = getEnv();
    return env.NODE_ENV === "production" ? env.COOKIE_DOMAIN : undefined;
  })(),
  path: "/",
} as const;

export const getSupabaseCookieConfig = (isHttps?: boolean) => ({
  ...SUPABASE_COOKIE_CONFIG,
  secure: SUPABASE_COOKIE_CONFIG.secure || isHttps || false,
});
