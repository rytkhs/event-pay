import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { DEMO_ALLOWED_PREFIXES, DEMO_REDIRECT_PATHS } from "@core/constants/demo-config";
import {
  shouldShowMaintenancePage,
  getMaintenancePageHTML,
} from "@core/maintenance/maintenance-page";
import { buildCsp } from "@core/security/csp";
import { getEnv } from "@core/utils/cloudflare-env";

const AFTER_LOGIN_REDIRECT_PATH = "/dashboard";

function getDemoAction(pathname: string): "redirect" | "allow" | "block" {
  if (DEMO_REDIRECT_PATHS.includes(pathname)) return "redirect";
  if (DEMO_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return "allow";
  return "block";
}

function isAuthPath(pathname: string): boolean {
  // 認証ページ: ログイン済みならダッシュボードへ誘導（パスワードリセット関連は例外）
  if (pathname === "/login" || pathname === "/register" || pathname === "/start-demo") return true;
  return false;
}

function isStaticPage(pathname: string): boolean {
  // SSGされた静的ページのリスト
  const staticPages = [
    "/",
    "/privacy", // プライバシーポリシー
    "/terms", // 利用規約
    "/tokushoho/platform", // 特定商取引法（プラットフォーム）
  ];
  return staticPages.includes(pathname);
}

function isPublicPath(pathname: string): boolean {
  // 明示的な公開ページ。その他はデフォルトで保護扱い
  const publicExact = [
    "/",
    "/start-demo",
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
    "/auth/callback",
    "/auth/callback/line",
    "/auth/line",
    "/auth/auth-code-error",
    "/demo-redirect",
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

/**
 * nonce生成（動的ページ用）
 */
function generateNonce(fallbackId: string): string {
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
    return fallbackId.replace(/-/g, "");
  }
}

/**
 * レスポンスに共通ヘッダーを設定
 */
function applyCommonHeaders(
  response: NextResponse,
  options: {
    requestId: string;
    nonce: string | null;
    isDemo: boolean;
    csp: string | null;
    reportUrl: string;
  }
): void {
  response.headers.set("x-request-id", options.requestId);

  if (options.nonce) {
    response.headers.set("x-nonce", options.nonce);
  }

  if (options.isDemo) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  if (options.csp) {
    response.headers.set("Content-Security-Policy", options.csp);
    response.headers.set("Reporting-Endpoints", `csp-endpoint="${options.reportUrl}"`);
  }
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const pathname = request.nextUrl.pathname;
  const reportUrl = new URL("/api/csp-report", request.url).toString();

  // 1. メンテナンスモードチェック（最優先）
  const env = getEnv();
  const maintenanceMode = env.MAINTENANCE_MODE;
  const bypassToken = env.MAINTENANCE_BYPASS_TOKEN;
  const searchParams = request.nextUrl.searchParams;

  if (shouldShowMaintenancePage(pathname, searchParams, maintenanceMode, bypassToken)) {
    return new NextResponse(getMaintenancePageHTML(), {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "3600",
        "x-request-id": requestId,
      },
    });
  }

  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";

  // 2. デモ環境: URLルーティング制御
  if (isDemo) {
    const action = getDemoAction(pathname);
    if (action === "redirect") {
      // クライアントサイドリダイレクト用の転送ページへ（CORSエラー回避）
      // ブラウザURLを更新させてパラメータを確実に読み取らせるため redirect を使用
      const redirectPageUrl = new URL("/demo-redirect", request.url);
      redirectPageUrl.searchParams.set("to", pathname);
      return NextResponse.redirect(redirectPageUrl);
    }
    if (action === "block") {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "x-request-id": requestId },
      });
    }
  }

  // 3. ページタイプ判定
  const isStatic = isStaticPage(pathname);
  const isPublic = isPublicPath(pathname);

  // 4. nonce生成（動的ページのみ）
  const nonce = isStatic ? null : generateNonce(requestId);

  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
  }

  // 5. CSP生成（本番のみ）
  // requestHeadersにもセットすることで、Next.jsがレンダリング時にnonceを読み取れるようにする
  const csp =
    process.env.NODE_ENV === "production"
      ? buildCsp({
          mode: isStatic ? "static" : "dynamic",
          nonce,
          isDev: false,
        })
      : null;

  if (csp) {
    requestHeaders.set("Content-Security-Policy", csp);
  }

  // 6. ベースレスポンス作成
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 共通ヘッダー適用
  applyCommonHeaders(response, { requestId, nonce, isDemo, csp, reportUrl });

  // 7. 認証ページ（/login, /register, /start-demo）は特別処理
  // ログイン済みユーザーをダッシュボードへリダイレクトするため、認証チェックが必要
  const isAuth = isAuthPath(pathname);

  // 8. 公開ページかつ認証ページでない場合は早期リターン（Supabase認証スキップ）
  if (isPublic && !isAuth) {
    return response;
  }

  // 9. 認証が必要なページ: Supabase SSRクライアント
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

  // 10. 認証ガード: 未ログインはログイン画面へ
  if (!user) {
    // デモ環境かつログイン・登録ページの場合は、本番環境へリダイレクト
    if (isDemo && (pathname === "/login" || pathname === "/register")) {
      const redirectPageUrl = new URL("/demo-redirect", request.url);
      redirectPageUrl.searchParams.set("to", pathname);
      const redirectResponse = NextResponse.redirect(redirectPageUrl);
      applyCommonHeaders(redirectResponse, { requestId, nonce, isDemo, csp, reportUrl });
      return redirectResponse;
    }

    // 公開ページの場合はそのまま表示
    if (isPublic) {
      return response;
    }

    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl);

    // Cookieをコピー（Cloudflare Workers環境での同期問題対策）
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    applyCommonHeaders(redirectResponse, { requestId, nonce, isDemo, csp, reportUrl });
    return redirectResponse;
  }

  // 11. ログイン済みが認証ページへ来たらダッシュボードへ
  if (isAuth) {
    const dashboardUrl = new URL(AFTER_LOGIN_REDIRECT_PATH, request.url);
    const redirectResponse = NextResponse.redirect(dashboardUrl);

    // Cookieをコピー（Cloudflare Workers環境での同期問題対策）
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    applyCommonHeaders(redirectResponse, { requestId, nonce, isDemo, csp, reportUrl });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api/webhooks|api/cron|api/csp-report|api/errors|api/health|healthz|readyz|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.well-known|apple-app-site-association|assetlinks.json|sw.js|service-worker.js|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|css|js)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
