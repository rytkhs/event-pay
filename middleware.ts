import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { generateSecureUuid } from '@/lib/security/crypto';

export async function middleware(request: NextRequest) {
  // リクエスト相関IDを生成・伝播
  const requestId = request.headers.get('x-request-id') || generateSecureUuid();

  // リクエストヘッダーに相関IDを追加
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // レスポンスヘッダーにも相関IDを含める（デバッグ用）
  response.headers.set('x-request-id', requestId);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          response.cookies.set({ name, value, ...options });
          response.headers.set('x-request-id', requestId);
        },
        remove(name: string, options) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          response.cookies.set({ name, value: "", ...options });
          response.headers.set('x-request-id', requestId);
        },
      },
    }
  );

  // セッション情報を取得（セッションCookieも自動更新される）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 認証が必要なルート
  const protectedRoutes = ["/home", "/events", "/profile", "/admin"];
  // 認証済みユーザーがアクセスできないルート
  const authRoutes = ["/login", "/register"];
  // 公開ルート（認証不要）
  const publicRoutes = ["/auth", "/api/auth", "/", "/favicon.ico", "/_next"];

  // 保護されたルートへの未認証アクセス
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 認証済みユーザーが認証ページにアクセス
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  // 公開ルート以外で未認証の場合はすべて保護されたルートとして扱う
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  if (!isPublicRoute && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
