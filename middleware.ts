/**
 * Next.js Middleware for Authentication
 * HTTP Only Cookie 認証とセキュリティヘッダーの設定
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';
import { clearAllSupabaseCookies } from '@/lib/auth/cookie-manager';
import { 
  isStateChangingRequest, 
  getCSRFTokenFromRequest, 
  validateCSRFToken,
  generateCSRFToken,
  setCSRFTokenCookie,
  createCSRFErrorResponse 
} from '@/lib/security/csrf';

// 認証が必要なルートのパターン
const protectedRoutes = [
  '/dashboard',
  '/events',
  '/api/events',
  '/api/payments',
];

// 認証済みユーザーがアクセスできないルート（リダイレクト対象）
const authRoutes = [
  '/auth/login',
  '/auth/register',
];

// 公開ルート（認証不要）
const publicRoutes = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/auth/update-password',
  '/attend',
  '/api/auth',
  '/api/webhooks',
  '/api/attendances/register',
];

// 静的アセットとNext.js内部ルート
const skipMiddleware = [
  '/_next',
  '/favicon.ico',
  '/api/_next',
  '/.well-known',
];

// CSRF検証から除外するルート
const csrfExemptRoutes = [
  '/api/auth',      // 認証API（初回ログイン時にはトークンがない）
  '/api/webhooks',  // Webhook（外部からの呼び出し）
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的アセットやNext.js内部ルートはスキップ
  if (skipMiddleware.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  try {
    const { supabase, supabaseResponse } = createClient(request);
    
    // セキュリティヘッダーの設定
    const response = supabaseResponse || NextResponse.next();
    setSecurityHeaders(response);

    // CSRF保護チェック（状態変更操作の場合）
    if (isStateChangingRequest(request) && !isCsrfExemptRoute(pathname)) {
      const { headerToken, cookieToken } = getCSRFTokenFromRequest(request);
      
      // CSRFトークンが提供されていない場合
      if (!headerToken || !cookieToken) {
        return createCSRFErrorResponse('CSRF token is required for state-changing operations');
      }
      
      // CSRFトークンの検証
      if (!validateCSRFToken(headerToken, cookieToken)) {
        return createCSRFErrorResponse('Invalid CSRF token');
      }
    }

    // 現在のユーザーを取得
    const { data: { user }, error } = await supabase.auth.getUser();

    // CSRFトークンの設定（認証済みユーザーで、まだトークンがない場合）
    if (user && !request.cookies.get('csrf-token')) {
      const csrfToken = generateCSRFToken();
      setCSRFTokenCookie(response, csrfToken);
    }

    // 公開ルートの場合、認証チェックをスキップ
    if (isPublicRoute(pathname)) {
      // 認証済みユーザーが認証ページにアクセスした場合、ダッシュボードにリダイレクト
      if (user && authRoutes.some(route => pathname.startsWith(route))) {
        const redirectUrl = new URL('/dashboard', request.url);
        return NextResponse.redirect(redirectUrl);
      }
      return response;
    }

    // 保護されたルートの認証チェック
    if (isProtectedRoute(pathname)) {
      if (!user || error) {
        // セッションが無効な場合、認証Cookieを削除
        if (error) {
          clearAllSupabaseCookies(response);
        }

        // APIルートの場合は401を返す
        if (pathname.startsWith('/api/')) {
          return new NextResponse(
            JSON.stringify({
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: '認証が必要です',
              },
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
        }

        // ページの場合はログインページにリダイレクト
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }
    }

    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    
    // エラー時は安全側に倒してログインページにリダイレクト
    if (isProtectedRoute(pathname) && !pathname.startsWith('/api/')) {
      const loginUrl = new URL('/auth/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // APIルートの場合は500エラー
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'サーバーエラーが発生しました',
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return NextResponse.next();
  }
}

/**
 * 公開ルートかどうかを判定
 */
function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => {
    if (route === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(route);
  });
}

/**
 * 保護されたルートかどうかを判定
 */
function isProtectedRoute(pathname: string): boolean {
  return protectedRoutes.some(route => pathname.startsWith(route));
}

/**
 * CSRF検証から除外するルートかどうかを判定
 */
function isCsrfExemptRoute(pathname: string): boolean {
  return csrfExemptRoutes.some(route => pathname.startsWith(route));
}

/**
 * セキュリティヘッダーの設定
 */
function setSecurityHeaders(response: NextResponse) {
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.stripe.com https://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // HTTPS必須（本番環境）
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)  
     * - favicon.ico (favicon file)
     * - public files (public folder files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};