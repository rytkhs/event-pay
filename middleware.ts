import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { getEnv } from "@core/utils/cloudflare-env";

const AFTER_LOGIN_REDIRECT_PATH = "/dashboard";

function isAuthPath(pathname: string): boolean {
  // 認証ページ: ログイン済みならホームへ誘導（パスワードリセット関連は例外）
  if (pathname === "/login" || pathname === "/register") return true;
  return false;
}

function isPublicPath(pathname: string): boolean {
  // 明示的な公開ページ。その他はデフォルトで保護扱い
  const publicExact = [
    "/",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon",
    "/apple-icon.png",
    "/safari-pinned-tab.svg",
    "/login",
    "/register",
    "/reset-password",
    "/verify-otp",
    "/verify-email",
    "/reset-password/update",
    "/confirm",
    "/contact",
    "/terms",
    "/privacy",
    "/tokushoho",
    "/debug",
  ];
  if (publicExact.includes(pathname)) return true;
  const publicPrefixes = [
    "/guest/",
    "/invite/",
    "/auth/reset-password/",
    "/tokushoho/",
    "/reset-password/",
  ];
  return publicPrefixes.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  // CSP用のnonceを生成し、ヘッダー経由でNextへ伝播（App Routerは x-nonce と CSP の 'nonce-...' を認識）
  const nonce = (() => {
    try {
      if (typeof btoa !== "undefined" && typeof crypto?.randomUUID === "function") {
        return btoa(crypto.randomUUID()).replace(/=+$/g, "");
      }
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      let raw = "";
      for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
      return btoa(raw).replace(/=+$/g, "");
    } catch {
      return requestId.replace(/-/g, "");
    }
  })();
  requestHeaders.set("x-nonce", nonce);

  // ベースレスポンス（ヘッダー伝播）
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-nonce", nonce);

  // 本番のみ：動的に生成した nonce で CSP を付与（開発/プレビューは next.config 側の静的CSPを使用）
  if (process.env.NODE_ENV === "production") {
    const cspDirectives = [
      "default-src 'self'",
      // strict-dynamic を併用し、nonce 付きルートスクリプトからの信頼伝播を許可
      `script-src 'self' 'nonce-${nonce}' https://js.stripe.com https://maps.googleapis.com 'strict-dynamic'`,
      "script-src-attr 'none'",
      // style は Level 3 の -elem/-attr で厳格化（属性インラインは不許可）
      `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
      "style-src-attr 'none'",
      // 画像系は Maps 関連と data/blob を許可
      "img-src 'self' data: blob: https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Stripe/Supabase/Maps などへの接続を明示（開発環境ではローカルSupabaseも許可）
      process.env.NODE_ENV !== "production"
        ? "connect-src 'self' http://127.0.0.1:54321 https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com https://m.stripe.network https://q.stripe.com https://maps.googleapis.com"
        : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com https://m.stripe.network https://q.stripe.com https://maps.googleapis.com",
      // Stripe 3DS/Checkout のために frame を許可
      "frame-src 'self' https://hooks.stripe.com https://checkout.stripe.com https://js.stripe.com",
      // セキュリティ強化系
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    response.headers.set("Content-Security-Policy", cspDirectives);
  }

  // Supabase SSRクライアント（Cookieの双方向同期: getAll / setAll）
  const env = getEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies: Array<{ name: string; value: string; options?: any }>) {
        cookies.forEach(({ name, value, options }) => {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 認証ガード: 公開以外はログイン必須
  if (!isPublicPath(pathname) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl, { headers: response.headers });
    redirectResponse.headers.set("x-request-id", requestId);
    return redirectResponse;
  }

  // ログイン済みが認証ページへ来たらホームへ
  if (isAuthPath(pathname) && user) {
    const dashboardUrl = new URL(AFTER_LOGIN_REDIRECT_PATH, request.url);
    const redirectResponse = NextResponse.redirect(dashboardUrl, { headers: response.headers });
    redirectResponse.headers.set("x-request-id", requestId);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    // APIや静的アセット等は対象外（CSPはHTMLレスポンスにのみ付与）
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|images).*)",
  ],
};
