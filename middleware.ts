import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { generateSecureUuid } from '@core/security/crypto';

const AFTER_LOGIN_REDIRECT_PATH = "/home";

function isAuthPath(pathname: string): boolean {
  // 認証ページ: ログイン済みならホームへ誘導
  // 注意: パスワードリセット関連はログイン済みでもアクセス許可
  if (pathname === "/login" || pathname === "/register") return true;
  return false;
}

function isPublicPath(pathname: string): boolean {
  // 明示的な公開ページ。その他はデフォルトで保護扱い
  const publicExact = ["/", "/favicon.ico", "/login", "/register", "/reset-password"];
  if (publicExact.includes(pathname)) return true;
  const publicPrefixes = ["/guest/", "/invite/", "/auth/reset-password/"];
  return publicPrefixes.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  // リクエスト相関IDを生成・伝播
  const requestId = request.headers.get('x-request-id') ?? generateSecureUuid();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // ベースレスポンス（ヘッダー伝播）
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('x-request-id', requestId);

  // Supabase SSRクライアント（Cookieの双方向同期: getAll / setAll）
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 認証ガード: 公開以外はログイン必須
  if (!isPublicPath(pathname) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl, { headers: response.headers });
    redirectResponse.headers.set('x-request-id', requestId);
    return redirectResponse;
  }

  // ログイン済みが認証ページへ来たらホームへ
  if (isAuthPath(pathname) && user) {
    const homeUrl = new URL(AFTER_LOGIN_REDIRECT_PATH, request.url);
    const redirectResponse = NextResponse.redirect(homeUrl, { headers: response.headers });
    redirectResponse.headers.set('x-request-id', requestId);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    // APIや静的アセット等は対象外
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
